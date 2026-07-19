-- Preserve all inputs before Path of Building initialises because it may replace
-- Lua's global arg table. Each worker intentionally evaluates exactly one build.
local inputFile = arg[1]
local expectedAssignments = { }
for index = 2, #arg do
	local slotName, itemId, itemName = tostring(arg[index]):match("([^\t]*)\t([^\t]*)\t(.*)")
	if slotName and itemId then
		table.insert(expectedAssignments, {
			slotName = slotName,
			itemId = tonumber(itemId),
			itemName = itemName,
		})
	end
end

io.stdout:setvbuf("no")
dofile("HeadlessWrapper.lua")

local function numberOrZero(value)
	if type(value) ~= "number" or value ~= value or value == math.huge or value == -math.huge then
		return 0
	end
	return value
end

local function elementalMaximumHit(output)
	local minimum
	for _, key in ipairs({ "FireMaximumHitTaken", "ColdMaximumHitTaken", "LightningMaximumHitTaken" }) do
		local value = numberOrZero(output[key])
		if value > 0 and (not minimum or value < minimum) then
			minimum = value
		end
	end
	return minimum or 0
end

local function usesFullDps()
	local groups = build and build.skillsTab and build.skillsTab.socketGroupList or { }
	for _, group in ipairs(groups) do
		if group.enabled ~= false and group.includeInFullDPS then
			return true
		end
	end
	return false
end

local function damageMetric(output)
	if usesFullDps() then
		return numberOrZero(output.FullDPS), "FullDPS"
	end

	local totalDps = numberOrZero(output.CombinedDPS)
	local metricName = "CombinedDPS"
	if totalDps <= 0 and output.Minion then
		totalDps = numberOrZero(output.Minion.CombinedDPS)
		metricName = "MinionCombinedDPS"
	end
	if totalDps <= 0 then
		totalDps = numberOrZero(output.TotalDPS)
		metricName = "TotalDPS"
	end
	return totalDps, metricName
end

local function metrics(output)
	local totalDps, dpsMetric = damageMetric(output)
	return {
		totalDps,
		numberOrZero(output.TotalEHP),
		numberOrZero(output.PhysicalMaximumHitTaken),
		elementalMaximumHit(output),
		numberOrZero(output.ChaosMaximumHitTaken),
		numberOrZero(output.Life),
		numberOrZero(output.EnergyShield),
		numberOrZero(output.Armour),
		numberOrZero(output.Evasion),
		numberOrZero(output.SpellSuppressionChance or output.SpellSuppression),
		numberOrZero(output.FireResist or output.FireResistance),
		numberOrZero(output.ColdResist or output.ColdResistance),
		numberOrZero(output.LightningResist or output.LightningResistance),
		numberOrZero(output.ChaosResist or output.ChaosResistance),
	}, dpsMetric
end

local function verifyEquippedItems()
	local itemSet = build and build.itemsTab and build.itemsTab.activeItemSet
	local items = build and build.itemsTab and build.itemsTab.items
	for _, expected in ipairs(expectedAssignments) do
		local slot = itemSet and itemSet[expected.slotName]
		local loadedId = slot and slot.selItemId
		local loadedItem = loadedId and items and items[loadedId]
		local loadedName = loadedItem and loadedItem.name or "no parsed item"
		if loadedId ~= expected.itemId then
			return string.format(
				"Path of Building did not equip %s in %s (expected item %s, loaded %s: %s).",
				expected.itemName ~= "" and expected.itemName or "the candidate",
				expected.slotName,
				tostring(expected.itemId),
				tostring(loadedId),
				tostring(loadedName)
			)
		end
		if not loadedItem then
			return string.format(
				"Path of Building assigned item %s to %s but rejected the candidate item text.",
				tostring(expected.itemId),
				expected.slotName
			)
		end
		if expected.itemName ~= "" and not tostring(loadedName):find(expected.itemName, 1, true) then
			return string.format(
				"Path of Building equipped the wrong item in %s (expected %s, loaded %s).",
				expected.slotName,
				expected.itemName,
				tostring(loadedName)
			)
		end
	end
end

if not inputFile then
	io.write("POE_ERROR\t0\tNo build input was supplied.\n")
	return
end

local file = io.open(inputFile, "rb")
if not file then
	io.write("POE_ERROR\t0\tUnable to open build input.\n")
	return
end

local xml = file:read("*a")
file:close()
local ok, errorMessage = pcall(function()
	loadBuildFromXML(xml, "optimizer")
	-- Let deferred calculation callbacks settle before metrics are read.
	for _ = 1, 3 do
		runCallback("OnFrame")
	end
end)
local output = build and build.calcsTab and build.calcsTab.mainOutput
if not ok or not output then
	io.write("POE_ERROR\t0\t", tostring(errorMessage or "Path of Building did not produce calculation output."), "\n")
	return
end

local verificationError = verifyEquippedItems()
if verificationError then
	io.write("POE_ERROR\t0\t", verificationError, "\n")
	return
end

local values, dpsMetric = metrics(output)
for index, value in ipairs(values) do
	values[index] = string.format("%.17g", value)
end
io.write("POE_DPS_METRIC\t0\t", dpsMetric, "\n")
io.write("POE_METRICS\t0\t", table.concat(values, "\t"), "\n")
io.flush()

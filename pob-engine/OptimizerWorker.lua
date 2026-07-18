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

local function metrics(output)
	local totalDps = numberOrZero(output.CombinedDPS)
	if totalDps <= 0 and output.Minion then
		totalDps = numberOrZero(output.Minion.CombinedDPS)
	end
	if totalDps <= 0 then
		totalDps = numberOrZero(output.TotalDPS)
	end

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
	}
end

for index = 1, #arg do
	local file = io.open(arg[index], "rb")
	if not file then
		io.write("POE_ERROR\t", tostring(index - 1), "\tUnable to open build input.\n")
	else
		local xml = file:read("*a")
		file:close()
		local ok, errorMessage = pcall(loadBuildFromXML, xml, "optimizer-" .. tostring(index))
		local output = build and build.calcsTab and build.calcsTab.mainOutput
		if not ok or not output then
			io.write("POE_ERROR\t", tostring(index - 1), "\t", tostring(errorMessage or "Path of Building did not produce calculation output."), "\n")
		else
			local values = metrics(output)
			for valueIndex, value in ipairs(values) do
				values[valueIndex] = string.format("%.17g", value)
			end
			io.write("POE_METRICS\t", tostring(index - 1), "\t", table.concat(values, "\t"), "\n")
		end
	end
end

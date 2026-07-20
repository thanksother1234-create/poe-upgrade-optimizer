import { NextResponse } from "next/server";
import { finalizeOptimizationJob, OptimizationJobService, validOptimizationClientId, validOptimizationJobId } from "@/services/queue/optimization-job-service";

export const maxDuration = 30;

async function authorizedJob(request: Request, jobId: string, service: OptimizationJobService) {
  if (!service.configured) return { response: NextResponse.json({ error: "The durable optimization queue is not configured." }, { status: 503 }) };
  if (!validOptimizationJobId(jobId)) return { response: NextResponse.json({ error: "Optimization job not found." }, { status: 404 }) };
  const clientId = request.headers.get("x-poe-client-id");
  if (!validOptimizationClientId(clientId)) return { response: NextResponse.json({ error: "A valid browser queue identity is required." }, { status: 400 }) };
  const job = await service.get(jobId);
  if (!job || job.clientId !== clientId) return { response: NextResponse.json({ error: "Optimization job not found or expired." }, { status: 404 }) };
  return { job };
}

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const service = new OptimizationJobService();
  try {
    const { jobId } = await params;
    const authorized = await authorizedJob(request, jobId, service);
    if (authorized.response) return authorized.response;
    const job = authorized.job!;
    if (job.state === "completed" && !job.result) {
      try {
        job.result = await finalizeOptimizationJob(job);
        delete job.engineResult;
        await service.save(job);
        await service.releaseClient(job);
      } catch (error) {
        job.state = "failed";
        job.error = error instanceof Error ? error.message : "The completed Path of Building result could not be ranked.";
        job.completedAt = new Date().toISOString();
        delete job.payload.engineRequest;
        delete job.engineResult;
        await service.save(job);
        await service.releaseClient(job);
      }
    }
    return NextResponse.json(await service.publicStatus(job), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The optimization job could not be loaded." }, { status: 503 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const service = new OptimizationJobService();
  try {
    const { jobId } = await params;
    const authorized = await authorizedJob(request, jobId, service);
    if (authorized.response) return authorized.response;
    const job = await service.cancel(authorized.job!);
    return NextResponse.json(await service.publicStatus(job), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The optimization job could not be cancelled." }, { status: 503 });
  }
}

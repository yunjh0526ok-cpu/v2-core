import { NextResponse } from "next/server";
import { searchLaws } from "@/lib/law-api";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q") ?? searchParams.get("query") ?? "";
  const data = await searchLaws(query);
  return NextResponse.json(data);
}

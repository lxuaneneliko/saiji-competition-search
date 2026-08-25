import { NextRequest, NextResponse } from "next/server";
import { searchCompetitions } from "@/lib/github";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const aliases = params
    .getAll("alias")
    .flatMap((item) => item.split("|"))
    .filter(Boolean);

  try {
    const data = await searchCompetitions({
      competition: params.get("competition") ?? "",
      year: params.get("year") ?? undefined,
      organizer: params.get("organizer") ?? undefined,
      aliases,
    });

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "搜尋時發生未預期錯誤。";
    const rateLimited = message.includes("使用上限");
    return NextResponse.json(
      { error: message },
      {
        status: message.includes("至少") ? 400 : rateLimited ? 429 : 502,
        headers: {
          "Cache-Control": "private, no-store",
          ...(rateLimited ? { "Retry-After": "60" } : {}),
        },
      },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getSharryShortLinkTarget } from "@/lib/sharry";

type RouteParams = {
  params: Promise<{ token: string }>;
};

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { token } = await params;
  const targetUrl = getSharryShortLinkTarget(token);

  if (!targetUrl) {
    return new NextResponse("Not found", { status: 404 });
  }

  return NextResponse.redirect(targetUrl);
}

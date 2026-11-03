import { NextResponse } from "next/server";

// Позволяет статическому экспорту (NEXT_EXPORT=1) вывести роут без сервера.
export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json({ message: "Hello, world!" });
}
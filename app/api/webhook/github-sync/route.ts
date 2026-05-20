import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { exec } from "node:child_process";

export const runtime = "nodejs";

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const hmac = createHmac("sha256", secret);
  hmac.update(payload);
  const digest = "sha256=" + hmac.digest("hex");

  const digestBuffer = Buffer.from(digest, "utf8");
  const signatureBuffer = Buffer.from(signature, "utf8");

  if (digestBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return timingSafeEqual(digestBuffer, signatureBuffer);
}

export async function POST(request: NextRequest) {
  try {
    const secret = process.env.GITHUB_WEBHOOK_SECRET?.trim();
    if (!secret) {
      console.error("[GitHub Sync Webhook] GITHUB_WEBHOOK_SECRET is not configured.");
      return NextResponse.json(
        { error: "서버에 웹훅 비밀키가 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    const signature = request.headers.get("x-hub-signature-256");
    if (!signature) {
      console.warn("[GitHub Sync Webhook] Missing x-hub-signature-256 header.");
      return NextResponse.json(
        { error: "인증 헤더가 유실되었습니다." },
        { status: 401 }
      );
    }

    // Read raw body
    const payload = await request.text();

    // Verify HMAC-SHA256 signature
    if (!verifySignature(payload, signature, secret)) {
      console.warn("[GitHub Sync Webhook] Signature verification failed.");
      return NextResponse.json(
        { error: "유효하지 않은 서명입니다." },
        { status: 401 }
      );
    }

    let body;
    try {
      body = JSON.parse(payload);
    } catch {
      return NextResponse.json(
        { error: "올바른 JSON 페이로드가 아닙니다." },
        { status: 400 }
      );
    }

    const branch = process.env.SYNC_BRANCH?.trim() || "main";
    const expectedRef = `refs/heads/${branch}`;

    // GitHub webhook push payload has a 'ref' property indicating the target branch
    if (body.ref && body.ref !== expectedRef) {
      console.log(
        `[GitHub Sync Webhook] Ignored push to branch ${body.ref}. Expected ${expectedRef}`
      );
      return NextResponse.json({
        message: `동기화 대상 브랜치가 아닙니다. (${body.ref})`,
        ignored: true,
      });
    }

    console.log(`[GitHub Sync Webhook] Verified signature. Initiating git sync for branch: ${branch}...`);

    const projectDir = process.cwd();
    const command = `git fetch origin && git reset --hard origin/${branch}`;
    const postSyncCommand = process.env.POST_SYNC_COMMAND?.trim();

    // Run the shell command asynchronously in the background so we don't block the webhook response
    exec(command, { cwd: projectDir }, (error, stdout, stderr) => {
      if (error) {
        console.error(`[GitHub Sync Webhook] Git sync failed:`, error.message);
        console.error(stderr);
        return;
      }

      console.log(`[GitHub Sync Webhook] Git sync successfully completed:\n`, stdout);

      // If a post-sync command is configured, run it
      if (postSyncCommand) {
        console.log(`[GitHub Sync Webhook] Executing post-sync command: "${postSyncCommand}"...`);
        exec(postSyncCommand, { cwd: projectDir }, (postError, postStdout, postStderr) => {
          if (postError) {
            console.error(`[GitHub Sync Webhook] Post-sync command failed:`, postError.message);
            console.error(postStderr);
            return;
          }
          console.log(`[GitHub Sync Webhook] Post-sync command successfully completed:\n`, postStdout);
        });
      }
    });

    return NextResponse.json({
      message: "동기화 요청을 수신하여 백그라운드에서 동기화를 시작했습니다.",
      syncing: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    console.error("[GitHub Sync Webhook] Error processing webhook:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

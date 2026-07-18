// Google Safe Browsing Lookup API(v4)로 목적지 URL의 피싱·멀웨어 여부를 검사합니다.
// GOOGLE_SAFE_BROWSING_API_KEY 가 없거나 API가 실패하면 서비스 가용성을 위해 통과시킵니다.

type SafetyResult = {
  safe: boolean;
  threatType?: string;
};

const THREAT_LABELS: Record<string, string> = {
  MALWARE: "악성코드 유포",
  SOCIAL_ENGINEERING: "피싱·사기",
  UNWANTED_SOFTWARE: "원치 않는 소프트웨어",
  POTENTIALLY_HARMFUL_APPLICATION: "유해 가능 앱",
};

export function describeThreat(threatType?: string) {
  return (threatType && THREAT_LABELS[threatType]) || "위험";
}

export async function checkUrlsSafety(urls: string[]): Promise<SafetyResult> {
  const apiKey = process.env.GOOGLE_SAFE_BROWSING_API_KEY?.trim();
  if (!apiKey || urls.length === 0) {
    return { safe: true };
  }

  try {
    const response = await fetch(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client: { clientId: "samlink", clientVersion: "1.0.0" },
          threatInfo: {
            threatTypes: Object.keys(THREAT_LABELS),
            platformTypes: ["ANY_PLATFORM"],
            threatEntryTypes: ["URL"],
            threatEntries: urls.map((url) => ({ url })),
          },
        }),
        signal: AbortSignal.timeout(4000),
      },
    );

    if (!response.ok) {
      return { safe: true };
    }

    const data = (await response.json()) as {
      matches?: { threatType?: string }[];
    };
    const match = data.matches?.[0];
    return match ? { safe: false, threatType: match.threatType } : { safe: true };
  } catch {
    return { safe: true };
  }
}

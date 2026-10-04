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

// 사용 중인 링크 전부를 다시 검사할 때 쓴다(2026-10-04, 매일 1회). 만들 때 한 번만 검사하면
// 나중에 목적지가 악성으로 바뀐 링크를 그대로 학생에게 보내게 된다.
// checkUrlsSafety 와 달리 API 실패를 '안전'으로 치지 않고 null 로 돌려 알린다. 한 번에 500개까지(API 한도).
export async function findUnsafeUrls(urls: string[]): Promise<Map<string, string> | null> {
  const apiKey = process.env.GOOGLE_SAFE_BROWSING_API_KEY?.trim();
  if (!apiKey) return null;

  const unsafe = new Map<string, string>();
  const unique = [...new Set(urls)];
  for (let start = 0; start < unique.length; start += 500) {
    const batch = unique.slice(start, start + 500);
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
              threatEntries: batch.map((url) => ({ url })),
            },
          }),
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!response.ok) return null;
      const data = (await response.json()) as {
        matches?: { threatType?: string; threat?: { url?: string } }[];
      };
      for (const match of data.matches ?? []) {
        if (match.threat?.url) unsafe.set(match.threat.url, match.threatType ?? "UNKNOWN");
      }
    } catch {
      return null;
    }
  }
  return unsafe;
}

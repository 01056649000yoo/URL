// Google Safe Browsing Lookup API(v4)로 목적지 URL의 피싱·멀웨어 여부를 검사합니다.
// 키가 없으면(개발) 검사하지 않는다. 만들 때 검사는 API 가 실패하면 한 번 더 묻고 그래도 안 되면 막는다(2026-11-03 KISA).

type SafetyResult = {
  safe: boolean;
  threatType?: string;
  /** 검사 API 를 쓰지 못함(오류·시간 초과) */
  unavailable?: boolean;
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

// 만들 때 검사(2026-11-03 KISA 점검): 키가 없으면(개발 환경) 검사를 건너뛰지만, 검사 API 가 실패·시간 초과면
// 한 번 다시 묻고 그래도 안 되면 '검사 못 함'(unavailable)으로 돌려 만들기를 잠시 막는다 — 실패를 안전으로 치지 않는다.
export async function checkUrlsSafety(urls: string[]): Promise<SafetyResult> {
  const apiKey = process.env.GOOGLE_SAFE_BROWSING_API_KEY?.trim();
  if (!apiKey || urls.length === 0) {
    return { safe: true };
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await lookupOnce(apiKey, urls);
    if (result) return result;
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return { safe: false, unavailable: true };
}

async function lookupOnce(apiKey: string, urls: string[]): Promise<SafetyResult | null> {
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
        signal: AbortSignal.timeout(3000),
      },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { matches?: { threatType?: string }[] };
    const match = data.matches?.[0];
    return match ? { safe: false, threatType: match.threatType } : { safe: true };
  } catch {
    return null;
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

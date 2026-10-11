export interface LicenseText {
  file: string;
  text: string;
}

export interface PackageLicense {
  name: string;
  version: string;
  license: string;
  repository?: string;
  author?: string;
  direct: boolean;
  texts: LicenseText[];
}

let cache: Promise<PackageLicense[]> | null = null;

/** ビルド時に scripts/generate-licenses.mjs が生成した licenses.json を読み込む */
export function fetchLicenses(): Promise<PackageLicense[]> {
  if (!cache) {
    cache = fetch('./licenses.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ packages: PackageLicense[] }>;
      })
      .then((d) => d.packages)
      .catch((e) => {
        cache = null;
        throw e;
      });
  }
  return cache;
}

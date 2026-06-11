import { partBaseFromFileName, readSinText } from './sin-read';

export type SinMachineHeader = {
  cms: string;
  gauge: string;
};

export type ResolvedSyntechMaquina = SinMachineHeader & {
  syntech_maquina: number;
  part_base: string;
};

function normalizeGauge(raw: string) {
  return raw.trim().toUpperCase().replace(',', '.');
}

/** Linha 1 do .sin → CMS530 / CMS502 / CMS502+ / CMS822 + calibre E*. */
export function parseMachineFromSin(text: string): SinMachineHeader | null {
  const firstLine = text.split(/\r?\n/)[0] ?? '';
  const match = firstLine.match(/CMS(\d+)(\+?)\.\S+\s+(E[\d,.]+)/i);
  if (!match) return null;

  return {
    cms: `CMS${match[1]}${match[2] ?? ''}`.toUpperCase(),
    gauge: normalizeGauge(match[3]),
  };
}

export function syntechMaquinaFromSin(header: SinMachineHeader): number | null {
  const cms = header.cms.toUpperCase();
  const gauge = normalizeGauge(header.gauge);

  if (cms === 'CMS530' && gauge === 'E7.2') return 1;
  if (cms === 'CMS502' && gauge === 'E6.2') return 5;
  if (cms === 'CMS502' && gauge === 'E3.5.2') return 10;
  if (cms === 'CMS502+' && gauge === 'E3.5.2') return 13;
  if (cms === 'CMS822' && gauge === 'E3.5.2') return 14;

  return null;
}

function formatCmsDisplay(cms: string) {
  const match = cms.toUpperCase().match(/^CMS(\d+)(\+?)$/);
  if (!match) return cms.trim();
  return `CMS ${match[1]}${match[2]}`;
}

function formatGaugeDisplay(gauge: string) {
  const parts = normalizeGauge(gauge).split('.');
  if (parts.length === 3 && parts[0].startsWith('E')) {
    return `${parts[0]},${parts[1]}.${parts[2]}`;
  }
  return normalizeGauge(gauge);
}

export function formatMachineLabel(header: SinMachineHeader) {
  return `${formatCmsDisplay(header.cms)} ${formatGaugeDisplay(header.gauge)}`;
}

export function resolveMachineForModel(
  modelFolder: string,
  partFileNames: string[]
): (SinMachineHeader & { syntech_maquina: number | null; part_base: string; label: string }) | null {
  const seen = new Set<string>();

  for (const fileName of partFileNames) {
    if (!/\.mdv$/i.test(fileName)) continue;
    const partBase = partBaseFromFileName(fileName);
    if (seen.has(partBase)) continue;
    seen.add(partBase);

    const sin = readSinText(modelFolder, partBase);
    if (!sin) continue;

    const header = parseMachineFromSin(sin.text);
    if (!header) continue;

    return {
      ...header,
      syntech_maquina: syntechMaquinaFromSin(header),
      part_base: partBase,
      label: formatMachineLabel(header),
    };
  }

  return null;
}

export function resolveMaquinaForModel(
  modelFolder: string,
  partFileNames: string[]
): ResolvedSyntechMaquina | null {
  const seen = new Set<string>();

  for (const fileName of partFileNames) {
    if (!/\.mdv$/i.test(fileName)) continue;
    const partBase = partBaseFromFileName(fileName);
    if (seen.has(partBase)) continue;
    seen.add(partBase);

    const sin = readSinText(modelFolder, partBase);
    if (!sin) continue;

    const header = parseMachineFromSin(sin.text);
    if (!header) continue;

    const syntech_maquina = syntechMaquinaFromSin(header);
    if (syntech_maquina === null) continue;

    return {
      ...header,
      syntech_maquina,
      part_base: partBase,
    };
  }

  return null;
}

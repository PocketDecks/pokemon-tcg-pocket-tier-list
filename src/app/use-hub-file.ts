import { useQuery } from "@tanstack/react-query";

export interface HubVariantRecord {
  variant: string;
  name: string;
  firstSeen: string;
  lastSeen: string;
  peakShare: number | null;
  peakDate: string | null;
  cards: string[];
}

export interface HubFile {
  hub: string;
  name: string;
  variants: HubVariantRecord[];
}

const fetchHubFile = async (hub: string): Promise<HubFile> => {
  const response = await fetch(`/data/hubs/${encodeURIComponent(hub)}.json`);
  if (!response.ok) {
    throw new Error(`Failed to fetch hub ${hub}: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as HubFile;
};

export const useHubFile = (hub: string | undefined) =>
  useQuery({
    queryKey: ["hub-file", hub],
    queryFn: () => fetchHubFile(hub ?? ""),
    enabled: Boolean(hub),
  });

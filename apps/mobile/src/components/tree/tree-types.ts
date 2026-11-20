import type { Person, FamilyRelationship } from '../../lib/database';

export type TreeMode = 'living_tree' | 'genealogy_graph';

export type TreeOrientation = 'top_to_bottom' | 'bottom_to_top' | 'left_to_right' | 'right_to_left';

export type TreeKinshipFilter = 'all' | 'paternal' | 'maternal' | 'ancestors' | 'descendants';

export interface TreePersonNode {
  id: string;
  name: string;
  person: Person;
  x: number;
  y: number;
  radius: number; // For Living Tree medallion
  width: number;  // For Genealogy Graph card
  height: number;
  level: number;  // 0 = focus/self, -1 = parents, -2 = grandparents, +1 = children
  normalizedLevel: number; // 0 = oldest generation
  kinshipLabel?: string | undefined;
  kinshipHindi?: string | undefined;
  isSelf: boolean;
  isDeceased: boolean;
  spouseIds: string[];
  parentIds: string[];
  childIds: string[];
  siblingIds: string[];
  status: 'confirmed' | 'suggested' | 'unknown';
  isHighlighted?: boolean | undefined;
  isDimmed?: boolean | undefined;
  memoryCount: number;
  hasVoice: boolean;
  hasPhotos: boolean;
  avatarUri?: string | null | undefined;
}

export interface OrganicBranch {
  id: string;
  path: string;
  strokeWidth: number;
  strokeColor: string;
  isSuggested: boolean;
  branchType: 'trunk' | 'limb' | 'twig' | 'spouse';
}

export interface LeafCluster {
  id: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  color: string;
  variant: 1 | 2 | 3;
}

export interface GenealogyConnector {
  id: string;
  path: string;
  type: 'marriage' | 'parent_child' | 'sibling' | 'adoptive';
  isSuggested: boolean;
  label?: string;
}

export interface TreeLayoutResult {
  orientation: TreeOrientation;
  nodes: TreePersonNode[];
  nodeMap: Map<string, TreePersonNode>;
  organicBranches: OrganicBranch[];
  leafClusters: LeafCluster[];
  genealogyConnectors: GenealogyConnector[];
  trunkPath: string;
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    width: number;
    height: number;
  };
  generationTiers: Array<{
    level: number;
    label: string;
    y: number;
  }>;
}

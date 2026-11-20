import type { Person, FamilyRelationship } from '../../lib/database';
import type {
  TreePersonNode,
  OrganicBranch,
  LeafCluster,
  GenealogyConnector,
  TreeLayoutResult,
  TreeMode,
  TreeOrientation
} from './tree-types';

const MEDALLION_RADIUS = 34; // Living tree node radius (68px circle)
const GRAPH_CARD_WIDTH = 148; // Genealogy card width
const GRAPH_CARD_HEIGHT = 82; // Genealogy card height
const LEVEL_HEIGHT_ORGANIC = 175;
const LEVEL_HEIGHT_GRAPH = 160;
const SPOUSE_GAP_ORGANIC = 28;
const SPOUSE_GAP_GRAPH = 24;
const SIBLING_GAP_ORGANIC = 48;
const SIBLING_GAP_GRAPH = 44;
const FAMILY_GROUP_GAP = 64;

export function computeFamilyTreeLayout(
  people: Person[],
  relationships: FamilyRelationship[],
  mode: TreeMode = 'living_tree',
  orientation: TreeOrientation = 'top_to_bottom'
): TreeLayoutResult {
  if (people.length === 0) {
    return {
      orientation,
      nodes: [],
      nodeMap: new Map(),
      organicBranches: [],
      leafClusters: [],
      genealogyConnectors: [],
      trunkPath: '',
      bounds: { minX: 0, maxX: 400, minY: 0, maxY: 600, width: 400, height: 600 },
      generationTiers: []
    };
  }

  // 1. Build lookup tables by ID and lowercase name
  const peopleById = new Map<string, Person>();
  const peopleByName = new Map<string, Person>();
  for (const p of people) {
    peopleById.set(p.id, p);
    peopleByName.set(p.name.toLowerCase().trim(), p);
  }

  const resolvePerson = (idOrName: string): Person | undefined => {
    return peopleById.get(idOrName) || peopleByName.get(idOrName.toLowerCase().trim());
  };

  const parentsMap = new Map<string, string[]>();   // childId -> parentIds
  const childrenMap = new Map<string, string[]>();  // parentId -> childIds
  const spousesMap = new Map<string, string[]>();   // personId -> spouseIds
  const siblingsMap = new Map<string, string[]>();  // personId -> siblingIds
  const relStatusMap = new Map<string, 'confirmed' | 'suggested'>();

  for (const r of relationships) {
    const pA = resolvePerson(r.personA);
    const pB = resolvePerson(r.personB);
    if (!pA || !pB || pA.id === pB.id) continue;

    const idA = pA.id;
    const idB = pB.id;
    const rel = r.relation.toLowerCase().trim();
    const status: 'confirmed' | 'suggested' = r.status === 'suggested' ? 'suggested' : 'confirmed';
    relStatusMap.set(`${idA}:${idB}`, status);
    relStatusMap.set(`${idB}:${idA}`, status);

    if (rel === 'parent' || rel === 'father' || rel === 'mother' || rel === 'adoptive parent' || rel === 'step-parent') {
      if (!childrenMap.has(idA)) childrenMap.set(idA, []);
      childrenMap.get(idA)!.push(idB);
      if (!parentsMap.has(idB)) parentsMap.set(idB, []);
      parentsMap.get(idB)!.push(idA);
    } else if (rel === 'child' || rel === 'son' || rel === 'daughter' || rel === 'adopted child' || rel === 'step-child') {
      if (!childrenMap.has(idB)) childrenMap.set(idB, []);
      childrenMap.get(idB)!.push(idA);
      if (!parentsMap.has(idA)) parentsMap.set(idA, []);
      parentsMap.get(idA)!.push(idB);
    } else if (rel === 'spouse' || rel === 'partner' || rel === 'husband' || rel === 'wife') {
      if (!spousesMap.has(idA)) spousesMap.set(idA, []);
      spousesMap.get(idA)!.push(idB);
      if (!spousesMap.has(idB)) spousesMap.set(idB, []);
      spousesMap.get(idB)!.push(idA);
    } else if (rel === 'sibling' || rel === 'brother' || rel === 'sister' || rel === 'half-sibling') {
      if (!siblingsMap.has(idA)) siblingsMap.set(idA, []);
      siblingsMap.get(idA)!.push(idB);
      if (!siblingsMap.has(idB)) siblingsMap.set(idB, []);
      siblingsMap.get(idB)!.push(idA);
    }
  }

  // 2. Assign Generational Levels
  // Find primary anchor: 'Me' / 'Self' or person with highest degree
  const anchor = people.find(p => {
    const n = p.name.toLowerCase().trim();
    const r = (p.relationship ?? '').toLowerCase();
    return n === 'me' || n === 'self' || r.includes('self');
  }) || people[0];

  const levelMap = new Map<string, number>();
  if (anchor) {
    levelMap.set(anchor.id, 0);
    const queue: string[] = [anchor.id];
    const visited = new Set<string>([anchor.id]);

    while (queue.length > 0) {
      const currId = queue.shift()!;
      const currLvl = levelMap.get(currId) ?? 0;

      // Parents are 1 level higher (more negative)
      for (const pId of parentsMap.get(currId) || []) {
        if (!levelMap.has(pId)) levelMap.set(pId, currLvl - 1);
        if (!visited.has(pId)) {
          visited.add(pId);
          queue.push(pId);
        }
      }

      // Children are 1 level lower (more positive)
      for (const cId of childrenMap.get(currId) || []) {
        if (!levelMap.has(cId)) levelMap.set(cId, currLvl + 1);
        if (!visited.has(cId)) {
          visited.add(cId);
          queue.push(cId);
        }
      }

      // Spouses & siblings are on same level
      for (const sId of spousesMap.get(currId) || []) {
        if (!levelMap.has(sId)) levelMap.set(sId, currLvl);
        if (!visited.has(sId)) {
          visited.add(sId);
          queue.push(sId);
        }
      }
      for (const sibId of siblingsMap.get(currId) || []) {
        if (!levelMap.has(sibId)) levelMap.set(sibId, currLvl);
        if (!visited.has(sibId)) {
          visited.add(sibId);
          queue.push(sibId);
        }
      }
    }
  }

  // Fallback for unconnected nodes using kinship relationship keywords
  for (const p of people) {
    if (!levelMap.has(p.id)) {
      const r = (p.relationship ?? '').toLowerCase();
      if (r.includes('great-grand') || r.includes('par-dada') || r.includes('par-nana')) {
        levelMap.set(p.id, -3);
      } else if (r.includes('grand') || r.includes('dada') || r.includes('dadi') || r.includes('nana') || r.includes('nani')) {
        levelMap.set(p.id, -2);
      } else if (r.includes('parent') || r.includes('father') || r.includes('mother') || r.includes('uncle') || r.includes('aunt') || r.includes('chacha') || r.includes('mama')) {
        levelMap.set(p.id, -1);
      } else if (r.includes('child') || r.includes('son') || r.includes('daughter') || r.includes('nephew') || r.includes('niece')) {
        levelMap.set(p.id, 1);
      } else if (r.includes('grandchild') || r.includes('pota') || r.includes('poti') || r.includes('nati')) {
        levelMap.set(p.id, 2);
      } else {
        levelMap.set(p.id, 0);
      }
    }
  }

  // Normalize levels so oldest generation is level 0 at top
  let minLevel = 0;
  for (const lvl of levelMap.values()) {
    if (lvl < minLevel) minLevel = lvl;
  }

  const tiers = new Map<number, Person[]>();
  for (const p of people) {
    const rawLvl = levelMap.get(p.id) ?? 0;
    const normalized = rawLvl - minLevel;
    if (!tiers.has(normalized)) tiers.set(normalized, []);
    tiers.get(normalized)!.push(p);
  }

  const sortedTierKeys = Array.from(tiers.keys()).sort((a, b) => a - b);
  const maxTier = sortedTierKeys.length > 0 ? Math.max(...sortedTierKeys) : 0;
  const nodeMap = new Map<string, TreePersonNode>();
  const nodes: TreePersonNode[] = [];

  const levelHeight = mode === 'living_tree' ? LEVEL_HEIGHT_ORGANIC : LEVEL_HEIGHT_GRAPH;
  const spouseGap = mode === 'living_tree' ? SPOUSE_GAP_ORGANIC : SPOUSE_GAP_GRAPH;
  const cardW = mode === 'living_tree' ? MEDALLION_RADIUS * 2 : GRAPH_CARD_WIDTH;

  function calculateKinshipLabel(p: Person): { label: string; hindi: string } {
    if (anchor && p.id === anchor.id) return { label: 'Self', hindi: 'स्वयं' };
    const rawLvl = levelMap.get(p.id) ?? 0;
    const isFemale = p.gender === 'female';

    if (rawLvl === -1) {
      return isFemale ? { label: 'Mother', hindi: 'माँ' } : { label: 'Father', hindi: 'पिताजी' };
    }
    if (rawLvl === -2) {
      const r = (p.relationship ?? '').toLowerCase();
      if (r.includes('nana') || r.includes('nani') || r.includes('maternal')) {
        return isFemale ? { label: 'Maternal Grandmother', hindi: 'नानी' } : { label: 'Maternal Grandfather', hindi: 'नाना' };
      }
      return isFemale ? { label: 'Paternal Grandmother', hindi: 'दादी' } : { label: 'Paternal Grandfather', hindi: 'दादाजी' };
    }
    if (rawLvl === -3) {
      return isFemale ? { label: 'Great-Grandmother', hindi: 'परदादी' } : { label: 'Great-Grandfather', hindi: 'परदादा' };
    }
    if (rawLvl === 0) {
      if (spousesMap.get(anchor?.id || '')?.includes(p.id)) {
        return isFemale ? { label: 'Wife', hindi: 'पत्नी' } : { label: 'Husband', hindi: 'पति' };
      }
      if (siblingsMap.get(anchor?.id || '')?.includes(p.id)) {
        return isFemale ? { label: 'Sister', hindi: 'बहन' } : { label: 'Brother', hindi: 'भाई' };
      }
      return { label: p.relationship || 'Peer Relative', hindi: 'सहोदर/सम्बन्धी' };
    }
    if (rawLvl === 1) {
      return isFemale ? { label: 'Daughter', hindi: 'बेटी' } : { label: 'Son', hindi: 'बेटा' };
    }
    if (rawLvl === 2) {
      return isFemale ? { label: 'Granddaughter', hindi: 'पोती' } : { label: 'Grandson', hindi: 'पोता' };
    }
    return { label: p.relationship || 'Relative', hindi: 'सम्बन्धी' };
  }

  let maxCanvasX = 500;

  // 3. Position individuals and partnerships generation by generation
  for (const lvl of sortedTierKeys) {
    const tierPeople = tiers.get(lvl) || [];
    const handledInTier = new Set<string>();
    const familyUnits: Array<{ p1: Person; p2?: Person }> = [];

    // Compute Y level based on orientation
    let currentTierY = 60 + lvl * levelHeight;
    if (orientation === 'bottom_to_top') {
      currentTierY = 60 + (maxTier - lvl) * levelHeight;
    }

    // Group spouses together in the same tier
    for (const p of tierPeople) {
      if (handledInTier.has(p.id)) continue;
      const spIds = spousesMap.get(p.id) || [];
      const spousePerson = spIds
        .map(id => peopleById.get(id))
        .find(sp => sp && tierPeople.some(tp => tp.id === sp.id && !handledInTier.has(sp.id)));

      if (spousePerson) {
        familyUnits.push({ p1: p, p2: spousePerson });
        handledInTier.add(p.id);
        handledInTier.add(spousePerson.id);
      } else {
        familyUnits.push({ p1: p });
        handledInTier.add(p.id);
      }
    }

    let currentX = 50;
    for (const unit of familyUnits) {
      const isSelf1 = unit.p1.id === anchor?.id || unit.p1.name.toLowerCase() === 'me';
      const kin1 = calculateKinshipLabel(unit.p1);

      const node1: TreePersonNode = {
        id: unit.p1.id,
        name: unit.p1.name,
        person: unit.p1,
        x: currentX + cardW / 2,
        y: currentTierY + (mode === 'living_tree' ? MEDALLION_RADIUS : GRAPH_CARD_HEIGHT / 2),
        radius: MEDALLION_RADIUS,
        width: GRAPH_CARD_WIDTH,
        height: GRAPH_CARD_HEIGHT,
        level: (levelMap.get(unit.p1.id) ?? 0),
        normalizedLevel: lvl,
        kinshipLabel: kin1.label,
        kinshipHindi: kin1.hindi,
        isSelf: isSelf1,
        isDeceased: Boolean(unit.p1.notes && /passed|died|late|deceased|shanti|death/i.test(unit.p1.notes)),
        spouseIds: spousesMap.get(unit.p1.id) || [],
        parentIds: parentsMap.get(unit.p1.id) || [],
        childIds: childrenMap.get(unit.p1.id) || [],
        siblingIds: siblingsMap.get(unit.p1.id) || [],
        status: unit.p1.reviewStatus === 'suggested' ? 'suggested' : 'confirmed',
        memoryCount: 0,
        hasVoice: false,
        hasPhotos: Boolean(unit.p1.avatarUri),
        avatarUri: unit.p1.avatarUri ?? null
      };
      nodes.push(node1);
      nodeMap.set(node1.id, node1);

      if (unit.p2) {
        currentX += cardW + spouseGap;
        const isSelf2 = unit.p2.id === anchor?.id || unit.p2.name.toLowerCase() === 'me';
        const kin2 = calculateKinshipLabel(unit.p2);

        const node2: TreePersonNode = {
          id: unit.p2.id,
          name: unit.p2.name,
          person: unit.p2,
          x: currentX + cardW / 2,
          y: currentTierY + (mode === 'living_tree' ? MEDALLION_RADIUS : GRAPH_CARD_HEIGHT / 2),
          radius: MEDALLION_RADIUS,
          width: GRAPH_CARD_WIDTH,
          height: GRAPH_CARD_HEIGHT,
          level: (levelMap.get(unit.p2.id) ?? 0),
          normalizedLevel: lvl,
          kinshipLabel: kin2.label,
          kinshipHindi: kin2.hindi,
          isSelf: isSelf2,
          isDeceased: Boolean(unit.p2.notes && /passed|died|late|deceased|shanti|death/i.test(unit.p2.notes)),
          spouseIds: spousesMap.get(unit.p2.id) || [],
          parentIds: parentsMap.get(unit.p2.id) || [],
          childIds: childrenMap.get(unit.p2.id) || [],
          siblingIds: siblingsMap.get(unit.p2.id) || [],
          status: unit.p2.reviewStatus === 'suggested' ? 'suggested' : 'confirmed',
          memoryCount: 0,
          hasVoice: false,
          hasPhotos: Boolean(unit.p2.avatarUri),
          avatarUri: unit.p2.avatarUri ?? null
        };
        nodes.push(node2);
        nodeMap.set(node2.id, node2);
        currentX += cardW + FAMILY_GROUP_GAP;
      } else {
        currentX += cardW + SIBLING_GAP_ORGANIC;
      }
    }

    if (currentX > maxCanvasX) maxCanvasX = currentX;
  }

  // 4. Centering pass: Adjust child x-coordinates to align nicely with parents
  for (const parent of nodes) {
    const childNodes = parent.childIds.map(id => nodeMap.get(id)).filter(Boolean) as TreePersonNode[];
    if (childNodes.length > 0) {
      const spouse = parent.spouseIds.map(id => nodeMap.get(id)).find(Boolean);
      const parentCenterX = spouse ? (parent.x + spouse.x) / 2 : parent.x;
      const childrenMinX = Math.min(...childNodes.map(c => c.x));
      const childrenMaxX = Math.max(...childNodes.map(c => c.x));
      const childrenCenterX = (childrenMinX + childrenMaxX) / 2;
      const shift = (parentCenterX - childrenCenterX) * 0.45; // Gentle organic shift

      if (Math.abs(shift) > 5) {
        for (const c of childNodes) {
          c.x += shift;
          if (c.x > maxCanvasX) maxCanvasX = c.x + 80;
        }
      }
    }
  }

  // 5. Generate Connectors & Branches
  const organicBranches: OrganicBranch[] = [];
  const leafClusters: LeafCluster[] = [];
  const genealogyConnectors: GenealogyConnector[] = [];
  const handledCouples = new Set<string>();

  // A. Marriage connectors
  for (const node of nodes) {
    for (const sId of node.spouseIds) {
      const spouse = nodeMap.get(sId);
      if (!spouse) continue;
      const coupleKey = [node.id, spouse.id].sort().join(':');
      if (handledCouples.has(coupleKey)) continue;
      handledCouples.add(coupleKey);

      const isSuggested = relStatusMap.get(`${node.id}:${spouse.id}`) === 'suggested';

      if (mode === 'living_tree') {
        // Organic curved bough connecting partners
        const leftNode = node.x < spouse.x ? node : spouse;
        const rightNode = node.x < spouse.x ? spouse : node;
        const midX = (leftNode.x + rightNode.x) / 2;
        const dipY = leftNode.y + 16;
        const branchPath = `M ${leftNode.x + MEDALLION_RADIUS - 2} ${leftNode.y} Q ${midX} ${dipY} ${rightNode.x - MEDALLION_RADIUS + 2} ${rightNode.y}`;

        organicBranches.push({
          id: `sp-organic-${coupleKey}`,
          path: branchPath,
          strokeWidth: isSuggested ? 3 : 5,
          strokeColor: isSuggested ? '#D97706' : '#5D4037',
          isSuggested,
          branchType: 'spouse'
        });

        // Add romantic leaf accent above the marriage union
        leafClusters.push({
          id: `leaf-sp-${coupleKey}`,
          x: midX,
          y: dipY - 8,
          rotation: -15,
          scale: 0.9,
          color: '#557A46',
          variant: 1
        });
      } else {
        // Clean genealogy marriage bridge
        const leftNode = node.x < spouse.x ? node : spouse;
        const rightNode = node.x < spouse.x ? spouse : node;
        const x1 = leftNode.x + GRAPH_CARD_WIDTH / 2;
        const y1 = leftNode.y;
        const x2 = rightNode.x - GRAPH_CARD_WIDTH / 2;
        const y2 = rightNode.y;

        genealogyConnectors.push({
          id: `sp-graph-${coupleKey}`,
          path: `M ${x1} ${y1} L ${x2} ${y2}`,
          type: 'marriage',
          isSuggested,
          label: 'Spouse'
        });
      }
    }
  }

  // B. Parent-Child branches
  const handledParentGroups = new Set<string>();

  for (const parent of nodes) {
    if (handledParentGroups.has(parent.id)) continue;

    const spouse = parent.spouseIds.map(id => nodeMap.get(id)).find(Boolean);
    const spouseId = spouse ? spouse.id : null;

    // Collect all children of this parent or couple
    const childIds = new Set<string>(parent.childIds);
    if (spouse) {
      for (const cid of spouse.childIds) childIds.add(cid);
    }

    const childNodes = Array.from(childIds)
      .map(id => nodeMap.get(id))
      .filter(Boolean) as TreePersonNode[];

    if (childNodes.length > 0) {
      const originX = spouse ? (parent.x + spouse.x) / 2 : parent.x;
      const originY = spouse
        ? (mode === 'living_tree' ? parent.y + 16 : parent.y)
        : (mode === 'living_tree' ? parent.y + MEDALLION_RADIUS : parent.y + GRAPH_CARD_HEIGHT / 2);

      const isSuggested = childNodes.some(c => relStatusMap.get(`${parent.id}:${c.id}`) === 'suggested');

      if (mode === 'living_tree') {
        const branchStemY = originY + 36;

        // Central descending branch stem
        organicBranches.push({
          id: `stem-${parent.id}`,
          path: `M ${originX} ${originY} C ${originX} ${originY + 18}, ${originX} ${branchStemY - 10}, ${originX} ${branchStemY}`,
          strokeWidth: isSuggested ? 4 : 7,
          strokeColor: isSuggested ? '#D97706' : '#4E342E',
          isSuggested,
          branchType: 'limb'
        });

        // Fork to each child with graceful S-curves / bezier boughs
        for (const child of childNodes) {
          const targetY = child.y - MEDALLION_RADIUS;
          const ctrlY1 = branchStemY + (targetY - branchStemY) * 0.45;
          const ctrlY2 = branchStemY + (targetY - branchStemY) * 0.75;
          const curvePath = `M ${originX} ${branchStemY} C ${originX} ${ctrlY1}, ${child.x} ${ctrlY2}, ${child.x} ${targetY}`;

          organicBranches.push({
            id: `child-organic-${parent.id}-${child.id}`,
            path: curvePath,
            strokeWidth: isSuggested ? 3 : 5,
            strokeColor: isSuggested ? '#D97706' : '#6D4C41',
            isSuggested,
            branchType: 'twig'
          });

          // Leaf cluster near child attachment
          leafClusters.push({
            id: `leaf-${child.id}`,
            x: child.x + (child.x > originX ? 14 : -14),
            y: targetY - 6,
            rotation: child.x > originX ? 35 : -35,
            scale: 0.85,
            color: '#4A6B53',
            variant: 2
          });
        }
      } else {
        // Crisp genealogy orthogonal lines with smooth radius corners
        const midY = originY + 28;
        const minChildX = Math.min(...childNodes.map(c => c.x));
        const maxChildX = Math.max(...childNodes.map(c => c.x));

        let pathStr = `M ${originX} ${originY} L ${originX} ${midY}`;
        if (minChildX < maxChildX) {
          pathStr += ` M ${minChildX} ${midY} L ${maxChildX} ${midY}`;
        }
        for (const child of childNodes) {
          pathStr += ` M ${child.x} ${midY} L ${child.x} ${child.y - GRAPH_CARD_HEIGHT / 2}`;
        }

        genealogyConnectors.push({
          id: `child-graph-${parent.id}`,
          path: pathStr,
          type: 'parent_child',
          isSuggested,
          label: 'Child'
        });
      }
    }

    handledParentGroups.add(parent.id);
    if (spouseId) handledParentGroups.add(spouseId);
  }

  // C. Central Organic Tree Trunk (Living Tree mode)
  let trunkPath = '';
  if (mode === 'living_tree' && nodes.length > 0) {
    const allX = nodes.map(n => n.x);
    const avgX = allX.reduce((a, b) => a + b, 0) / allX.length;
    const maxY = Math.max(...nodes.map(n => n.y)) + 90;
    const trunkBaseY = maxY + 60;

    // Organic tapered trunk flare at base
    trunkPath = `M ${avgX - 36} ${trunkBaseY} C ${avgX - 22} ${trunkBaseY - 40}, ${avgX - 14} ${maxY - 40}, ${avgX} ${maxY - 80} C ${avgX + 14} ${maxY - 40}, ${avgX + 22} ${trunkBaseY - 40}, ${avgX + 36} ${trunkBaseY} Z`;

    // Base root leaves
    leafClusters.push({
      id: 'root-leaf-1',
      x: avgX - 28,
      y: trunkBaseY - 18,
      rotation: -45,
      scale: 1.1,
      color: '#386641',
      variant: 3
    });
    leafClusters.push({
      id: 'root-leaf-2',
      x: avgX + 28,
      y: trunkBaseY - 18,
      rotation: 45,
      scale: 1.1,
      color: '#386641',
      variant: 3
    });
  }

  // 6. Compute Generation Tiers metadata for labels & guides
  const generationTiers = sortedTierKeys.map(lvl => {
    let label = 'Generation';
    if (lvl === 0) label = 'Grandparents & Elders';
    else if (lvl === 1) label = 'Parents & Uncles/Aunts';
    else if (lvl === 2) label = 'Our Generation';
    else if (lvl === 3) label = 'Children & Youth';
    else if (lvl >= 4) label = 'Grandchildren';

    return {
      level: lvl,
      label,
      y: 60 + lvl * levelHeight
    };
  });

  // Calculate canvas bounds with generous padding
  const allNodeX = nodes.map(n => n.x);
  const allNodeY = nodes.map(n => n.y);
  const minX = Math.max(0, Math.min(...allNodeX, 0) - 80);
  const maxX = Math.max(...allNodeX, maxCanvasX) + 120;
  const minY = 0;
  const maxY = Math.max(...allNodeY, 500) + 120;

  return {
    orientation,
    nodes,
    nodeMap,
    organicBranches,
    leafClusters,
    genealogyConnectors,
    trunkPath,
    bounds: {
      minX,
      maxX,
      minY,
      maxY,
      width: Math.max(maxX - minX, 600),
      height: Math.max(maxY - minY, 700)
    },
    generationTiers
  };
}

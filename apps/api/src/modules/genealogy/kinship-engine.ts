import { GraphPerson, GraphRelationship } from "../graph/graph-store.js";

export interface KinshipResult {
  targetPersonId: string;
  targetPersonName: string;
  englishLabel: string;
  hindiLabel: string;
  canonicalType: string;
  generationOffset: number; // 0 = same gen, -1 = parents, -2 = grandparents, +1 = children
  lineage: "paternal" | "maternal" | "direct" | "collateral" | "affinity" | "unknown";
  pathLength: number;
  pathDescription: string;
}

interface Step {
  fromId: string;
  toId: string;
  direction: "parent" | "child" | "spouse" | "sibling";
}

export function calculateKinship(
  referencePersonId: string,
  targetPersonId: string,
  people: Record<string, GraphPerson>,
  relationships: Record<string, GraphRelationship>
): KinshipResult {
  const refPerson = people[referencePersonId];
  const targetPerson = people[targetPersonId];

  if (!refPerson || !targetPerson) {
    return {
      targetPersonId,
      targetPersonName: targetPerson?.displayName || "Unknown",
      englishLabel: "Relationship not established",
      hindiLabel: "सम्बन्ध अज्ञात",
      canonicalType: "unknown",
      generationOffset: 0,
      lineage: "unknown",
      pathLength: 0,
      pathDescription: "Person not found in archive"
    };
  }

  if (referencePersonId === targetPersonId) {
    return {
      targetPersonId,
      targetPersonName: targetPerson.displayName,
      englishLabel: "Self",
      hindiLabel: "स्वयं",
      canonicalType: "self",
      generationOffset: 0,
      lineage: "direct",
      pathLength: 0,
      pathDescription: "Reference user"
    };
  }

  // Build adjacency graph
  const adj = new Map<string, Array<{ neighborId: string; direction: "parent" | "child" | "spouse" | "sibling"; relType: string }>>();
  for (const pId of Object.keys(people)) {
    adj.set(pId, []);
  }

  for (const rel of Object.values(relationships)) {
    if (rel.status === "disputed") continue;
    const from = rel.fromPersonId;
    const to = rel.toPersonId;
    if (!adj.has(from)) adj.set(from, []);
    if (!adj.has(to)) adj.set(to, []);

    const type = rel.type.toLowerCase();
    if (type === "parent" || type === "father" || type === "mother" || type === "adoptive_parent" || type === "step_parent") {
      // from is parent of to
      adj.get(from)!.push({ neighborId: to, direction: "child", relType: type });
      adj.get(to)!.push({ neighborId: from, direction: "parent", relType: type });
    } else if (type === "child" || type === "son" || type === "daughter" || type === "adopted_child" || type === "step_child") {
      // from is child of to
      adj.get(from)!.push({ neighborId: to, direction: "parent", relType: type });
      adj.get(to)!.push({ neighborId: from, direction: "child", relType: type });
    } else if (type === "spouse" || type === "partner" || type === "husband" || type === "wife") {
      adj.get(from)!.push({ neighborId: to, direction: "spouse", relType: type });
      adj.get(to)!.push({ neighborId: from, direction: "spouse", relType: type });
    } else if (type === "sibling" || type === "brother" || type === "sister" || type === "half_sibling") {
      adj.get(from)!.push({ neighborId: to, direction: "sibling", relType: type });
      adj.get(to)!.push({ neighborId: from, direction: "sibling", relType: type });
    }
  }

  // BFS to find shortest path
  const queue: Array<{ currentId: string; path: Step[] }> = [{ currentId: referencePersonId, path: [] }];
  const visited = new Set<string>([referencePersonId]);
  let shortestPath: Step[] | null = null;

  while (queue.length > 0) {
    const { currentId, path } = queue.shift()!;
    if (currentId === targetPersonId) {
      shortestPath = path;
      break;
    }

    const neighbors = adj.get(currentId) || [];
    for (const n of neighbors) {
      if (!visited.has(n.neighborId)) {
        visited.add(n.neighborId);
        queue.push({
          currentId: n.neighborId,
          path: [...path, { fromId: currentId, toId: n.neighborId, direction: n.direction }]
        });
      }
    }
  }

  if (!shortestPath || shortestPath.length === 0) {
    // Check if targetPerson has a stated relationship attribute in their profile
    const stated = (targetPerson.notes || "").toLowerCase();
    if (stated.includes("grandfather") || stated.includes("dada") || stated.includes("nana")) {
      const isMaternal = stated.includes("nana") || stated.includes("maternal");
      return {
        targetPersonId,
        targetPersonName: targetPerson.displayName,
        englishLabel: isMaternal ? "Maternal Grandfather" : "Paternal Grandfather",
        hindiLabel: isMaternal ? "नाना" : "दादा",
        canonicalType: "grandparent",
        generationOffset: -2,
        lineage: isMaternal ? "maternal" : "paternal",
        pathLength: 2,
        pathDescription: "Stated in profile notes"
      };
    }
    return {
      targetPersonId,
      targetPersonName: targetPerson.displayName,
      englishLabel: "Related family member",
      hindiLabel: "सम्बन्धी",
      canonicalType: "relative",
      generationOffset: 0,
      lineage: "unknown",
      pathLength: 0,
      pathDescription: "Unconnected path"
    };
  }

  const isFemale = targetPerson.gender === "female";
  const isMale = targetPerson.gender === "male";
  const directions = shortestPath.map((s) => s.direction);
  const dirStr = directions.join("->");

  // Calculate generation offset
  let genOffset = 0;
  for (const d of directions) {
    if (d === "parent") genOffset -= 1;
    else if (d === "child") genOffset += 1;
  }

  // 1. Direct Parent
  if (dirStr === "parent") {
    return {
      targetPersonId,
      targetPersonName: targetPerson.displayName,
      englishLabel: isFemale ? "Mother" : isMale ? "Father" : "Parent",
      hindiLabel: isFemale ? "माँ" : isMale ? "पिताजी" : "अभिभावक",
      canonicalType: "parent",
      generationOffset: -1,
      lineage: "direct",
      pathLength: 1,
      pathDescription: "Direct parent"
    };
  }

  // 2. Direct Child
  if (dirStr === "child") {
    return {
      targetPersonId,
      targetPersonName: targetPerson.displayName,
      englishLabel: isFemale ? "Daughter" : isMale ? "Son" : "Child",
      hindiLabel: isFemale ? "बेटी" : isMale ? "बेटा" : "संतान",
      canonicalType: "child",
      generationOffset: 1,
      lineage: "direct",
      pathLength: 1,
      pathDescription: "Direct child"
    };
  }

  // 3. Spouse
  if (dirStr === "spouse") {
    return {
      targetPersonId,
      targetPersonName: targetPerson.displayName,
      englishLabel: isFemale ? "Wife" : isMale ? "Husband" : "Spouse / Partner",
      hindiLabel: isFemale ? "पत्नी" : isMale ? "पति" : "जीवनसाथी",
      canonicalType: "spouse",
      generationOffset: 0,
      lineage: "affinity",
      pathLength: 1,
      pathDescription: "Direct spouse"
    };
  }

  // 4. Sibling
  if (dirStr === "sibling" || dirStr === "parent->child") {
    return {
      targetPersonId,
      targetPersonName: targetPerson.displayName,
      englishLabel: isFemale ? "Sister" : isMale ? "Brother" : "Sibling",
      hindiLabel: isFemale ? "बहन" : isMale ? "भाई" : "सहोदर",
      canonicalType: "sibling",
      generationOffset: 0,
      lineage: "collateral",
      pathLength: shortestPath.length,
      pathDescription: "Shared parentage"
    };
  }

  // 5. Grandparents (parent -> parent)
  if (dirStr === "parent->parent") {
    const intermediateParentId = shortestPath[0]?.toId;
    const intermediatePerson = intermediateParentId ? people[intermediateParentId] : null;
    const isMaternal = intermediatePerson?.gender === "female";

    if (isMaternal) {
      return {
        targetPersonId,
        targetPersonName: targetPerson.displayName,
        englishLabel: isFemale ? "Maternal Grandmother" : "Maternal Grandfather",
        hindiLabel: isFemale ? "नानी" : "नाना",
        canonicalType: "grandparent",
        generationOffset: -2,
        lineage: "maternal",
        pathLength: 2,
        pathDescription: "Mother's parent"
      };
    } else {
      return {
        targetPersonId,
        targetPersonName: targetPerson.displayName,
        englishLabel: isFemale ? "Paternal Grandmother" : "Paternal Grandfather",
        hindiLabel: isFemale ? "दादी" : "दादाजी",
        canonicalType: "grandparent",
        generationOffset: -2,
        lineage: "paternal",
        pathLength: 2,
        pathDescription: "Father's parent"
      };
    }
  }

  // 6. Grandchildren (child -> child)
  if (dirStr === "child->child") {
    return {
      targetPersonId,
      targetPersonName: targetPerson.displayName,
      englishLabel: isFemale ? "Granddaughter" : isMale ? "Grandson" : "Grandchild",
      hindiLabel: isFemale ? "पोती / नातिन" : isMale ? "पोता / नाती" : "पौत्र",
      canonicalType: "grandchild",
      generationOffset: 2,
      lineage: "direct",
      pathLength: 2,
      pathDescription: "Child's child"
    };
  }

  // 7. Uncles & Aunts (parent -> sibling or parent -> parent -> child)
  if (dirStr === "parent->sibling" || dirStr === "parent->parent->child") {
    const parentId = shortestPath[0]?.toId;
    const parentPerson = parentId ? people[parentId] : null;
    const isMaternal = parentPerson?.gender === "female";

    if (isMaternal) {
      return {
        targetPersonId,
        targetPersonName: targetPerson.displayName,
        englishLabel: isFemale ? "Maternal Aunt" : "Maternal Uncle",
        hindiLabel: isFemale ? "मौसी" : "मामा",
        canonicalType: "uncle_aunt",
        generationOffset: -1,
        lineage: "maternal",
        pathLength: shortestPath.length,
        pathDescription: "Mother's sibling"
      };
    } else {
      return {
        targetPersonId,
        targetPersonName: targetPerson.displayName,
        englishLabel: isFemale ? "Paternal Aunt" : "Paternal Uncle",
        hindiLabel: isFemale ? "बुआ" : "चाचा / ताऊ",
        canonicalType: "uncle_aunt",
        generationOffset: -1,
        lineage: "paternal",
        pathLength: shortestPath.length,
        pathDescription: "Father's sibling"
      };
    }
  }

  // 8. Nephews & Nieces (sibling -> child or parent -> child -> child)
  if (dirStr === "sibling->child" || dirStr === "parent->child->child") {
    return {
      targetPersonId,
      targetPersonName: targetPerson.displayName,
      englishLabel: isFemale ? "Niece" : isMale ? "Nephew" : "Sibling's Child",
      hindiLabel: isFemale ? "भतीजी / भांजी" : isMale ? "भतीजा / भांजा" : "भतीजा",
      canonicalType: "nephew_niece",
      generationOffset: 1,
      lineage: "collateral",
      pathLength: shortestPath.length,
      pathDescription: "Sibling's child"
    };
  }

  // 9. Cousins (parent -> sibling -> child or parent -> parent -> child -> child)
  if (dirStr === "parent->sibling->child" || dirStr === "parent->parent->child->child") {
    const parentId = shortestPath[0]?.toId;
    const parentPerson = parentId ? people[parentId] : null;
    const isMaternal = parentPerson?.gender === "female";

    return {
      targetPersonId,
      targetPersonName: targetPerson.displayName,
      englishLabel: isMaternal ? "Maternal Cousin" : "Paternal Cousin",
      hindiLabel: isMaternal ? "ममेरा भाई/बहन" : "चचेरा भाई/बहन",
      canonicalType: "cousin",
      generationOffset: 0,
      lineage: isMaternal ? "maternal" : "paternal",
      pathLength: shortestPath.length,
      pathDescription: `${isMaternal ? "Mother's" : "Father's"} sibling's child`
    };
  }

  // 10. Great-Grandparents
  if (dirStr === "parent->parent->parent") {
    return {
      targetPersonId,
      targetPersonName: targetPerson.displayName,
      englishLabel: isFemale ? "Great-Grandmother" : isMale ? "Great-Grandfather" : "Great-Grandparent",
      hindiLabel: isFemale ? "परदादी / परनानी" : isMale ? "परदादा / परनाना" : "परदादा",
      canonicalType: "great_grandparent",
      generationOffset: -3,
      lineage: "direct",
      pathLength: 3,
      pathDescription: "Grandparent's parent"
    };
  }

  // General fallback by generation offset
  let fallbackLabel = "Related relative";
  let fallbackHindi = "सम्बन्धी";
  if (genOffset === -1) {
    fallbackLabel = isFemale ? "Aunt / Elder" : isMale ? "Uncle / Elder" : "Elder Relative";
    fallbackHindi = isFemale ? "चाची / मौसी" : "चाचा / ताऊ";
  } else if (genOffset === -2) {
    fallbackLabel = isFemale ? "Grand-aunt / Elder" : isMale ? "Grand-uncle / Elder" : "Elder Ancestor";
    fallbackHindi = "वरिष्ठ सम्बन्धी";
  } else if (genOffset === 1) {
    fallbackLabel = isFemale ? "Niece / Junior" : isMale ? "Nephew / Junior" : "Junior Relative";
    fallbackHindi = "अनुज सम्बन्धी";
  } else if (genOffset === 0) {
    fallbackLabel = isFemale ? "Cousin / Peer" : isMale ? "Cousin / Peer" : "Peer Relative";
    fallbackHindi = "सम्बन्धी भाई/बहन";
  }

  return {
    targetPersonId,
    targetPersonName: targetPerson.displayName,
    englishLabel: fallbackLabel,
    hindiLabel: fallbackHindi,
    canonicalType: "relative",
    generationOffset: genOffset,
    lineage: "collateral",
    pathLength: shortestPath.length,
    pathDescription: directions.join(" -> ")
  };
}


export interface KinshipPerson {
  id: string;
  name: string;
  gender?: "male" | "female" | "other" | null | undefined;
  relationshipToUser?: string | null | undefined;
}

export interface KinshipRelationship {
  id?: string | undefined;
  personA: string; // From person (ID or Name)
  personB: string; // To person (ID or Name)
  relation: "parent" | "child" | "spouse" | "sibling" | "other" | string;
  evidence?: string | undefined;
}

export interface KinshipQueryResult {
  found: boolean;
  relationDescription: string;
  path: string[];
  explanation: string;
}

/**
 * Builds an adjacency structure for family relationships.
 */
export function buildFamilyGraph(people: KinshipPerson[], relationships: KinshipRelationship[]) {
  const personMap = new Map<string, KinshipPerson>();
  for (const p of people) {
    personMap.set(p.id.toLowerCase(), p);
    personMap.set(p.name.toLowerCase(), p);
  }

  // Directed parent -> child edges
  const parentsOf = new Map<string, Set<string>>(); // childId -> Set<parentId>
  const childrenOf = new Map<string, Set<string>>(); // parentId -> Set<childId>
  const spousesOf = new Map<string, Set<string>>(); // personId -> Set<spouseId>
  const siblingsOf = new Map<string, Set<string>>(); // personId -> Set<siblingId>

  const getCanonicalId = (ref: string) => {
    const p = personMap.get(ref.toLowerCase());
    return p ? p.id : ref;
  };

  for (const r of relationships) {
    const a = getCanonicalId(r.personA);
    const b = getCanonicalId(r.personB);
    if (!a || !b || a === b) continue;

    const rel = r.relation.toLowerCase();
    if (rel === "parent") {
      // a is parent of b
      if (!parentsOf.has(b)) parentsOf.set(b, new Set());
      parentsOf.get(b)!.add(a);
      if (!childrenOf.has(a)) childrenOf.set(a, new Set());
      childrenOf.get(a)!.add(b);
    } else if (rel === "child") {
      // a is child of b -> b is parent of a
      if (!parentsOf.has(a)) parentsOf.set(a, new Set());
      parentsOf.get(a)!.add(b);
      if (!childrenOf.has(b)) childrenOf.set(b, new Set());
      childrenOf.get(b)!.add(a);
    } else if (rel === "spouse" || rel === "partner") {
      if (!spousesOf.has(a)) spousesOf.set(a, new Set());
      spousesOf.get(a)!.add(b);
      if (!spousesOf.has(b)) spousesOf.set(b, new Set());
      spousesOf.get(b)!.add(a);
    } else if (rel === "sibling") {
      if (!siblingsOf.has(a)) siblingsOf.set(a, new Set());
      siblingsOf.get(a)!.add(b);
      if (!siblingsOf.has(b)) siblingsOf.set(b, new Set());
      siblingsOf.get(b)!.add(a);
    }
  }

  // Infer siblings if they share at least one parent
  for (const [child, parentSet] of parentsOf.entries()) {
    for (const parent of parentSet) {
      const coChildren = childrenOf.get(parent) ?? new Set();
      for (const sibling of coChildren) {
        if (sibling !== child) {
          if (!siblingsOf.has(child)) siblingsOf.set(child, new Set());
          siblingsOf.get(child)!.add(sibling);
          if (!siblingsOf.has(sibling)) siblingsOf.set(sibling, new Set());
          siblingsOf.get(sibling)!.add(child);
        }
      }
    }
  }

  return { personMap, parentsOf, childrenOf, spousesOf, siblingsOf, getCanonicalId };
}

/**
 * Checks for ancestry cycles (e.g. A is ancestor of B, and proposed B is parent of A).
 */
export function detectAncestryCycles(relationships: KinshipRelationship[]): { hasCycle: boolean; cyclePath?: string[] } {
  const childrenMap = new Map<string, string[]>();

  for (const r of relationships) {
    const rel = r.relation.toLowerCase();
    let parent = r.personA;
    let child = r.personB;
    if (rel === "child") {
      parent = r.personB;
      child = r.personA;
    } else if (rel !== "parent" && rel !== "adoptive_parent" && rel !== "step_parent") {
      continue;
    }

    if (parent === child) {
      return { hasCycle: true, cyclePath: [parent, child] };
    }

    if (!childrenMap.has(parent)) childrenMap.set(parent, []);
    childrenMap.get(parent)!.push(child);
  }

  const visited = new Set<string>();
  const activeStack = new Set<string>();
  const currentPath: string[] = [];

  const dfs = (node: string): boolean => {
    visited.add(node);
    activeStack.add(node);
    currentPath.push(node);

    for (const next of childrenMap.get(node) ?? []) {
      if (!visited.has(next)) {
        if (dfs(next)) return true;
      } else if (activeStack.has(next)) {
        currentPath.push(next);
        return true;
      }
    }

    activeStack.delete(node);
    currentPath.pop();
    return false;
  };

  for (const node of childrenMap.keys()) {
    if (!visited.has(node)) {
      if (dfs(node)) {
        return { hasCycle: true, cyclePath: [...currentPath] };
      }
    }
  }

  return { hasCycle: false };
}

/**
 * Resolves kinship between two persons (person1 and person2).
 */
export function resolveKinship(
  person1Ref: string,
  person2Ref: string,
  people: KinshipPerson[],
  relationships: KinshipRelationship[]
): KinshipQueryResult {
  const graph = buildFamilyGraph(people, relationships);
  const p1 = graph.getCanonicalId(person1Ref);
  const p2 = graph.getCanonicalId(person2Ref);

  const person1Obj = graph.personMap.get(p1.toLowerCase()) ?? { id: p1, name: person1Ref };
  const person2Obj = graph.personMap.get(p2.toLowerCase()) ?? { id: p2, name: person2Ref };

  if (p1 === p2) {
    return {
      found: true,
      relationDescription: "Self",
      path: [person1Obj.name],
      explanation: `${person1Obj.name} and ${person2Obj.name} refer to the same person.`
    };
  }

  // 1. Direct Parent / Child
  if (graph.parentsOf.get(p2)?.has(p1)) {
    const label = person1Obj.gender === "female" ? "Mother" : person1Obj.gender === "male" ? "Father" : "Parent";
    return {
      found: true,
      relationDescription: label,
      path: [person1Obj.name, person2Obj.name],
      explanation: `${person1Obj.name} is the ${label.toLowerCase()} of ${person2Obj.name}.`
    };
  }
  if (graph.parentsOf.get(p1)?.has(p2)) {
    const label = person1Obj.gender === "female" ? "Daughter" : person1Obj.gender === "male" ? "Son" : "Child";
    return {
      found: true,
      relationDescription: label,
      path: [person1Obj.name, person2Obj.name],
      explanation: `${person1Obj.name} is the ${label.toLowerCase()} of ${person2Obj.name}.`
    };
  }

  // 2. Spouse
  if (graph.spousesOf.get(p1)?.has(p2)) {
    const label = person1Obj.gender === "female" ? "Wife" : person1Obj.gender === "male" ? "Husband" : "Spouse";
    return {
      found: true,
      relationDescription: label,
      path: [person1Obj.name, person2Obj.name],
      explanation: `${person1Obj.name} is the ${label.toLowerCase()} of ${person2Obj.name}.`
    };
  }

  // 3. Sibling
  if (graph.siblingsOf.get(p1)?.has(p2)) {
    const label = person1Obj.gender === "female" ? "Sister" : person1Obj.gender === "male" ? "Brother" : "Sibling";
    return {
      found: true,
      relationDescription: label,
      path: [person1Obj.name, person2Obj.name],
      explanation: `${person1Obj.name} is the ${label.toLowerCase()} of ${person2Obj.name}.`
    };
  }

  // 4. Grandparent / Grandchild
  const p2Parents = graph.parentsOf.get(p2) ?? new Set();
  for (const parentId of p2Parents) {
    if (graph.parentsOf.get(parentId)?.has(p1)) {
      const parentObj = graph.personMap.get(parentId.toLowerCase());
      const isMaternal = parentObj?.gender === "female";
      const genLabel = person1Obj.gender === "female"
        ? (isMaternal ? "Maternal Grandmother (Nani)" : "Paternal Grandmother (Dadi)")
        : (isMaternal ? "Maternal Grandfather (Nana)" : "Paternal Grandfather (Dada)");
      return {
        found: true,
        relationDescription: genLabel,
        path: [person1Obj.name, parentObj?.name ?? parentId, person2Obj.name],
        explanation: `${person1Obj.name} is the ${genLabel} of ${person2Obj.name} (parent of ${parentObj?.name ?? "parent"}).`
      };
    }
  }

  const p1Parents = graph.parentsOf.get(p1) ?? new Set();
  for (const parentId of p1Parents) {
    if (graph.parentsOf.get(parentId)?.has(p2)) {
      const label = person1Obj.gender === "female" ? "Granddaughter" : person1Obj.gender === "male" ? "Grandson" : "Grandchild";
      return {
        found: true,
        relationDescription: label,
        path: [person1Obj.name, graph.personMap.get(parentId.toLowerCase())?.name ?? parentId, person2Obj.name],
        explanation: `${person1Obj.name} is the ${label.toLowerCase()} of ${person2Obj.name}.`
      };
    }
  }

  // 5. Uncle / Aunt (Sibling of parent, or spouse of sibling of parent)
  for (const parentId of p2Parents) {
    if (graph.siblingsOf.get(p1)?.has(parentId)) {
      const parentObj = graph.personMap.get(parentId.toLowerCase());
      const isMaternal = parentObj?.gender === "female";
      let title = person1Obj.gender === "female"
        ? (isMaternal ? "Maternal Aunt (Mausi)" : "Paternal Aunt (Bua)")
        : (isMaternal ? "Maternal Uncle (Mama)" : "Paternal Uncle (Chacha/Tau)");
      return {
        found: true,
        relationDescription: title,
        path: [person1Obj.name, parentObj?.name ?? parentId, person2Obj.name],
        explanation: `${person1Obj.name} is the ${title} of ${person2Obj.name} (sibling of ${parentObj?.name ?? "parent"}).`
      };
    }
  }

  // 6. Cousin (Child of parent's sibling)
  for (const p1Parent of p1Parents) {
    for (const p2Parent of p2Parents) {
      if (graph.siblingsOf.get(p1Parent)?.has(p2Parent)) {
        return {
          found: true,
          relationDescription: "Cousin",
          path: [person1Obj.name, graph.personMap.get(p1Parent.toLowerCase())?.name ?? p1Parent, graph.personMap.get(p2Parent.toLowerCase())?.name ?? p2Parent, person2Obj.name],
          explanation: `${person1Obj.name} and ${person2Obj.name} are cousins (their parents are siblings).`
        };
      }
    }
  }

  return {
    found: false,
    relationDescription: "Unknown connection",
    path: [],
    explanation: `Could not find a direct or known kinship path between ${person1Obj.name} and ${person2Obj.name} in the recorded family tree.`
  };
}

/**
 * Traces maternal or paternal ancestral line.
 */
export function traceAncestralLine(
  personRef: string,
  lineType: "maternal" | "paternal",
  people: KinshipPerson[],
  relationships: KinshipRelationship[]
): { line: KinshipPerson[]; description: string } {
  const graph = buildFamilyGraph(people, relationships);
  const startId = graph.getCanonicalId(personRef);
  const line: KinshipPerson[] = [];

  let currentId: string | undefined = startId;
  const visited = new Set<string>();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const p = graph.personMap.get(currentId.toLowerCase());
    if (p) line.push(p);

    const parents: Set<string> = graph.parentsOf.get(currentId) ?? new Set<string>();
    let nextParent: string | undefined;

    for (const parentId of parents) {
      const parentObj = graph.personMap.get(parentId.toLowerCase());
      if (lineType === "maternal" && parentObj?.gender === "female") {
        nextParent = parentId;
        break;
      }
      if (lineType === "paternal" && parentObj?.gender === "male") {
        nextParent = parentId;
        break;
      }
    }

    // If gender is unspecified but there is only 1 parent, or none matched
    if (!nextParent && parents.size === 1 && line.length === 1) {
      nextParent = [...parents][0];
    }

    currentId = nextParent;
  }

  const desc = line.length > 1
    ? `${lineType === "maternal" ? "Maternal" : "Paternal"} line for ${line[0]?.name}: ${line.map((p) => p.name).join(" → ")}`
    : `No extended ${lineType} ancestors found for ${personRef} in the recorded family tree.`;

  return { line, description: desc };
}

import type { GraphPerson, GraphRelationship } from "../graph/graph-store.js";

export interface GedcomIndividual {
  id: string; // e.g. @I1@
  name: string;
  givenName?: string | undefined;
  surname?: string | undefined;
  gender?: "male" | "female" | "other" | undefined;
  birthDate?: string | undefined;
  birthYear?: number | undefined;
  birthPlace?: string | undefined;
  deathDate?: string | undefined;
  notes?: string | undefined;
}

export interface GedcomFamilyRecord {
  id: string; // e.g. @F1@
  husbandId?: string | undefined;
  wifeId?: string | undefined;
  childrenIds: string[];
  marriageDate?: string | undefined;
  marriagePlace?: string | undefined;
}

export interface GedcomPreviewResult {
  totalIndividuals: number;
  totalFamilies: number;
  individuals: GedcomIndividual[];
  families: GedcomFamilyRecord[];
  duplicateCandidates: Array<{
    gedcomPerson: GedcomIndividual;
    existingPerson: GraphPerson;
    matchReason: string;
  }>;
  suggestedRelationshipsCount: number;
}

/**
 * Parses raw GEDCOM 5.5.1 text into structured Individuals and Families.
 */
export function parseGedcom(rawText: string): {
  individuals: GedcomIndividual[];
  families: GedcomFamilyRecord[];
} {
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const individuals: GedcomIndividual[] = [];
  const families: GedcomFamilyRecord[] = [];

  let currentIndi: Partial<GedcomIndividual> | null = null;
  let currentFam: Partial<GedcomFamilyRecord> | null = null;
  let currentContext: "INDI" | "FAM" | null = null;
  let lastTag = "";

  for (const line of lines) {
    const match = line.match(/^(\d+)\s+(@[A-Za-z0-9_]+@|[A-Za-z0-9_]+)\s*(.*)$/);
    if (!match) continue;

    const level = parseInt(match[1]!, 10);
    const tagOrId = match[2]!;
    const value = match[3] || "";

    if (level === 0) {
      if (currentIndi && currentIndi.id && currentIndi.name) {
        individuals.push({
          id: currentIndi.id,
          name: currentIndi.name,
          givenName: currentIndi.givenName,
          surname: currentIndi.surname,
          gender: currentIndi.gender,
          birthDate: currentIndi.birthDate,
          birthYear: currentIndi.birthYear,
          birthPlace: currentIndi.birthPlace,
          deathDate: currentIndi.deathDate,
          notes: currentIndi.notes
        });
      }
      if (currentFam && currentFam.id) {
        families.push({
          id: currentFam.id,
          husbandId: currentFam.husbandId,
          wifeId: currentFam.wifeId,
          childrenIds: currentFam.childrenIds || [],
          marriageDate: currentFam.marriageDate,
          marriagePlace: currentFam.marriagePlace
        });
      }

      currentIndi = null;
      currentFam = null;
      currentContext = null;

      if (value === "INDI") {
        currentIndi = { id: tagOrId, childrenIds: [] } as any;
        currentContext = "INDI";
      } else if (value === "FAM") {
        currentFam = { id: tagOrId, childrenIds: [] };
        currentContext = "FAM";
      }
      continue;
    }

    if (currentContext === "INDI" && currentIndi) {
      if (tagOrId === "NAME") {
        const cleanName = value.replace(/\//g, "").trim();
        currentIndi.name = cleanName;
        const slashMatch = value.match(/^(.*?)\/(.*?)\/$/);
        if (slashMatch) {
          currentIndi.givenName = slashMatch[1]?.trim() || undefined;
          currentIndi.surname = slashMatch[2]?.trim() || undefined;
        }
      } else if (tagOrId === "SEX") {
        if (value.toUpperCase().startsWith("M")) currentIndi.gender = "male";
        else if (value.toUpperCase().startsWith("F")) currentIndi.gender = "female";
        else currentIndi.gender = "other";
      } else if (tagOrId === "BIRT") {
        lastTag = "BIRT";
      } else if (tagOrId === "DEAT") {
        lastTag = "DEAT";
      } else if (tagOrId === "DATE") {
        if (lastTag === "BIRT") {
          currentIndi.birthDate = value;
          const yearMatch = value.match(/\b(18\d\d|19\d\d|20\d\d)\b/);
          if (yearMatch && yearMatch[1]) currentIndi.birthYear = parseInt(yearMatch[1], 10);
        } else if (lastTag === "DEAT") {
          currentIndi.deathDate = value;
        }
      } else if (tagOrId === "PLAC") {
        if (lastTag === "BIRT") currentIndi.birthPlace = value;
      } else if (tagOrId === "NOTE") {
        currentIndi.notes = (currentIndi.notes ? `${currentIndi.notes} ` : "") + value;
      }
    } else if (currentContext === "FAM" && currentFam) {
      if (tagOrId === "HUSB") currentFam.husbandId = value;
      else if (tagOrId === "WIFE") currentFam.wifeId = value;
      else if (tagOrId === "CHIL") {
        currentFam.childrenIds = currentFam.childrenIds || [];
        currentFam.childrenIds.push(value);
      } else if (tagOrId === "MARR") {
        lastTag = "MARR";
      } else if (tagOrId === "DATE" && lastTag === "MARR") {
        currentFam.marriageDate = value;
      } else if (tagOrId === "PLAC" && lastTag === "MARR") {
        currentFam.marriagePlace = value;
      }
    }
  }

  // Push last records
  if (currentIndi && currentIndi.id && currentIndi.name) {
    individuals.push({
      id: currentIndi.id,
      name: currentIndi.name,
      givenName: currentIndi.givenName,
      surname: currentIndi.surname,
      gender: currentIndi.gender,
      birthDate: currentIndi.birthDate,
      birthYear: currentIndi.birthYear,
      birthPlace: currentIndi.birthPlace,
      deathDate: currentIndi.deathDate,
      notes: currentIndi.notes
    });
  }
  if (currentFam && currentFam.id) {
    families.push({
      id: currentFam.id,
      husbandId: currentFam.husbandId,
      wifeId: currentFam.wifeId,
      childrenIds: currentFam.childrenIds || [],
      marriageDate: currentFam.marriageDate,
      marriagePlace: currentFam.marriagePlace
    });
  }

  return { individuals, families };
}

/**
 * Preview GEDCOM import against current existing family members to detect duplicate candidates
 */
export function previewGedcom(rawText: string, existingPeople: GraphPerson[]): GedcomPreviewResult {
  const { individuals, families } = parseGedcom(rawText);
  const duplicateCandidates: GedcomPreviewResult["duplicateCandidates"] = [];

  for (const indi of individuals) {
    const normName = indi.name.toLowerCase().trim();
    for (const ex of existingPeople) {
      const exNorm = ex.displayName.toLowerCase().trim();
      const nameMatch = normName === exNorm || ex.aliases.some((a) => a.toLowerCase() === normName);
      const birthMatch = indi.birthYear && ex.birthYear && Math.abs(indi.birthYear - ex.birthYear) <= 2;

      if (nameMatch) {
        duplicateCandidates.push({
          gedcomPerson: indi,
          existingPerson: ex,
          matchReason: birthMatch ? "Matching name and birth year" : "Matching name"
        });
        break;
      }
    }
  }

  // Calculate count of relationships that would be extracted
  let relCount = 0;
  for (const f of families) {
    if (f.husbandId && f.wifeId) relCount += 1; // marriage
    relCount += (f.childrenIds?.length || 0) * ((f.husbandId ? 1 : 0) + (f.wifeId ? 1 : 0));
  }

  return {
    totalIndividuals: individuals.length,
    totalFamilies: families.length,
    individuals,
    families,
    duplicateCandidates,
    suggestedRelationshipsCount: relCount
  };
}

/**
 * Generates standard GEDCOM 5.5.1 export text from current confirmed graph.
 */
export function exportGedcom(
  people: GraphPerson[],
  relationships: GraphRelationship[],
  familyName = "Yesterday Family Archive"
): string {
  const lines: string[] = [
    "0 HEAD",
    "1 SOUR YESTERDAY",
    "2 NAME Yesterday Family Heritage Platform",
    "2 VERS 0.4.0",
    "1 DEST YESTERDAY",
    `1 DATE ${new Date().toISOString().split("T")[0]}`,
    "1 SUBM @SUBM@",
    "1 FILE family_archive.ged",
    "1 GEDC",
    "2 VERS 5.5.1",
    "2 FORM LINEAGE-LINKED",
    "1 CHAR UTF-8",
    "0 @SUBM@ SUBM",
    `1 NAME ${familyName}`
  ];

  const personIdMap = new Map<string, string>();
  people.forEach((p, idx) => {
    personIdMap.set(p.id, `@I${idx + 1}@`);
  });

  // Export Individuals
  people.forEach((p) => {
    const gedId = personIdMap.get(p.id)!;
    lines.push(`0 ${gedId} INDI`);
    lines.push(`1 NAME ${p.displayName} //`);
    if (p.gender === "male") lines.push("1 SEX M");
    else if (p.gender === "female") lines.push("1 SEX F");
    else lines.push("1 SEX U");

    if (p.birthDate || p.birthYear || p.birthPlace) {
      lines.push("1 BIRT");
      if (p.birthDate) lines.push(`2 DATE ${p.birthDate}`);
      else if (p.birthYear) lines.push(`2 DATE ${p.birthYear}`);
      if (p.birthPlace) lines.push(`2 PLAC ${p.birthPlace}`);
    }

    if (p.deathDate) {
      lines.push("1 DEAT");
      lines.push(`2 DATE ${p.deathDate}`);
    }

    if (p.bio || p.notes) {
      lines.push(`1 NOTE ${p.bio || p.notes}`);
    }
  });

  // Export Families (Spouses & Parents)
  const spouseEdges = relationships.filter((r) => r.type === "spouse" || r.type === "partner");
  const parentEdges = relationships.filter(
    (r) => r.type === "parent" || r.type === "adoptive_parent" || r.type === "step_parent"
  );

  let famIndex = 1;
  const processedSpouses = new Set<string>();

  for (const s of spouseEdges) {
    const pairKey = [s.fromPersonId, s.toPersonId].sort().join(":");
    if (processedSpouses.has(pairKey)) continue;
    processedSpouses.add(pairKey);

    const famId = `@F${famIndex++}@`;
    lines.push(`0 ${famId} FAM`);

    const husb = people.find((p) => p.id === s.fromPersonId);
    const wife = people.find((p) => p.id === s.toPersonId);

    if (husb) lines.push(`1 HUSB ${personIdMap.get(husb.id)}`);
    if (wife) lines.push(`1 WIFE ${personIdMap.get(wife.id)}`);
    lines.push("1 MARR Y");

    // Find children
    const childrenIds = parentEdges
      .filter((pe) => pe.fromPersonId === s.fromPersonId || pe.fromPersonId === s.toPersonId)
      .map((pe) => pe.toPersonId);

    const uniqueChildren = Array.from(new Set(childrenIds));
    for (const childId of uniqueChildren) {
      const childGedId = personIdMap.get(childId);
      if (childGedId) lines.push(`1 CHIL ${childGedId}`);
    }
  }

  lines.push("0 TRLR");
  return lines.join("\n");
}


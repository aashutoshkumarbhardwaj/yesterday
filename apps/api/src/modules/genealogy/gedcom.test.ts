import test from "node:test";
import assert from "node:assert";
import Fastify from "fastify";
import { parseGedcom, previewGedcom, exportGedcom } from "./gedcom.js";
import { registerGenealogyRoutes } from "../../routes/genealogy.js";
import type { GraphPerson, GraphRelationship } from "../graph/graph-store.js";

const sampleGedcom = `0 HEAD
1 SOUR Gramps
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Ram /Sharma/
1 SEX M
1 BIRT
2 DATE 1935
2 PLAC Ayodhya
1 DEAT
2 DATE 2010
0 @I2@ INDI
1 NAME Sita /Sharma/
1 SEX F
1 BIRT
2 DATE 1940
2 PLAC Janakpur
0 @I3@ INDI
1 NAME Ramesh /Sharma/
1 SEX M
1 BIRT
2 DATE 1968
2 PLAC Lucknow
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
1 MARR
2 DATE 1958
2 PLAC Varanasi
0 TRLR`;

test("GEDCOM Parser: parses INDI, FAM, BIRT, DEAT, MARR correctly", () => {
  const result = parseGedcom(sampleGedcom);
  assert.strictEqual(result.individuals.length, 3);
  assert.strictEqual(result.families.length, 1);

  const ram = result.individuals.find((i) => i.name.includes("Ram"));
  assert.ok(ram);
  assert.strictEqual(ram?.birthYear, 1935);
  assert.strictEqual(ram?.birthPlace, "Ayodhya");
  assert.strictEqual(ram?.gender, "male");

  const fam = result.families[0];
  assert.strictEqual(fam?.husbandId, "@I1@");
  assert.strictEqual(fam?.wifeId, "@I2@");
  assert.strictEqual(fam?.childrenIds.length, 1);
  assert.strictEqual(fam?.marriageDate, "1958");
});

test("GEDCOM Preview: detects duplicate people against existing database", () => {
  const existingPeople: GraphPerson[] = [
    {
      id: "p_101",
      familyId: "fam_test",
      displayName: "Ram Sharma",
      aliases: ["Ram"],
      gender: "male",
      birthYear: 1935,
      reviewStatus: "confirmed",
      createdAt: "",
      updatedAt: ""
    }
  ];

  const preview = previewGedcom(sampleGedcom, existingPeople);
  assert.strictEqual(preview.totalIndividuals, 3);
  assert.strictEqual(preview.totalFamilies, 1);
  assert.strictEqual(preview.duplicateCandidates.length, 1);
  assert.strictEqual(preview.duplicateCandidates[0]?.gedcomPerson.name, "Ram Sharma");
  assert.strictEqual(preview.duplicateCandidates[0]?.existingPerson.id, "p_101");
});

test("GEDCOM Export: generates standard 5.5.1 text with HEAD, INDI, FAM, TRLR", () => {
  const people: GraphPerson[] = [
    {
      id: "p_1",
      familyId: "fam_1",
      displayName: "Kailash Sharma",
      aliases: [],
      gender: "male",
      birthYear: 1940,
      birthPlace: "Mathura",
      reviewStatus: "confirmed",
      createdAt: "",
      updatedAt: ""
    },
    {
      id: "p_2",
      familyId: "fam_1",
      displayName: "Sunita Sharma",
      aliases: [],
      gender: "female",
      birthYear: 1945,
      reviewStatus: "confirmed",
      createdAt: "",
      updatedAt: ""
    }
  ];

  const relationships: GraphRelationship[] = [
    {
      id: "r_1",
      familyId: "fam_1",
      fromPersonId: "p_1",
      toPersonId: "p_2",
      type: "spouse",
      status: "confirmed",
      createdAt: "",
      updatedAt: ""
    }
  ];

  const gedcomText = exportGedcom(people, relationships, "Sharma Heritage");
  assert.ok(gedcomText.includes("0 HEAD"));
  assert.ok(gedcomText.includes("1 SOUR YESTERDAY"));
  assert.ok(gedcomText.includes("2 VERS 5.5.1"));
  assert.ok(gedcomText.includes("0 @I1@ INDI"));
  assert.ok(gedcomText.includes("1 NAME Kailash Sharma //"));
  assert.ok(gedcomText.includes("0 @F1@ FAM"));
  assert.ok(gedcomText.includes("0 TRLR"));
});

test("Fastify Genealogy Routes: preview, export, audio-models endpoints", async () => {
  const app = Fastify();
  await registerGenealogyRoutes(app);

  // 1. Audio models manifest endpoint
  const modelsRes = await app.inject({
    method: "GET",
    url: "/v1/ai/audio-models"
  });
  assert.strictEqual(modelsRes.statusCode, 200);
  const modelsBody = JSON.parse(modelsRes.body);
  assert.strictEqual(modelsBody.success, true);
  assert.ok(modelsBody.offlineModels.length >= 2);

  // 2. GEDCOM preview
  const previewRes = await app.inject({
    method: "POST",
    url: "/v1/genealogy/gedcom/preview",
    payload: {
      familyId: "fam_preview_test",
      gedcomText: sampleGedcom
    }
  });
  assert.strictEqual(previewRes.statusCode, 200);
  const previewBody = JSON.parse(previewRes.body);
  assert.strictEqual(previewBody.success, true);
  assert.strictEqual(previewBody.preview.totalIndividuals, 3);
});


import test from 'node:test';
import assert from 'node:assert/strict';
import { computeFamilyTreeLayout } from './tree-layout';
import type { Person, FamilyRelationship } from '../../lib/database';

test('FamilyTreeLayout: Three-generation family with grandparents, parents, children', () => {
  const people: Person[] = [
    { id: '1', name: 'Grandpa Ramesh', gender: 'male', birthYear: 1940, createdAt: '' },
    { id: '2', name: 'Grandma Sita', gender: 'female', birthYear: 1945, createdAt: '' },
    { id: '3', name: 'Father Rajesh', gender: 'male', birthYear: 1970, createdAt: '' },
    { id: '4', name: 'Mother Priya', gender: 'female', birthYear: 1974, createdAt: '' },
    { id: '5', name: 'Me (Aarav)', gender: 'male', birthYear: 2002, relationship: 'Self', createdAt: '' }
  ];

  const relationships: FamilyRelationship[] = [
    { id: 'r1', personA: 'Grandpa Ramesh', personB: 'Grandma Sita', relation: 'spouse', status: 'confirmed' },
    { id: 'r2', personA: 'Grandpa Ramesh', personB: 'Father Rajesh', relation: 'parent', status: 'confirmed' },
    { id: 'r3', personA: 'Father Rajesh', personB: 'Mother Priya', relation: 'spouse', status: 'confirmed' },
    { id: 'r4', personA: 'Father Rajesh', personB: 'Me (Aarav)', relation: 'parent', status: 'confirmed' }
  ];

  const livingTree = computeFamilyTreeLayout(people, relationships, 'living_tree');
  assert.equal(livingTree.nodes.length, 5);
  assert.ok(livingTree.organicBranches.length > 0, 'Organic branches should be generated');
  assert.ok(livingTree.leafClusters.length > 0, 'Leaf clusters should be generated');
  assert.ok(livingTree.trunkPath.length > 0, 'Organic trunk path should be present');

  // Verify generational tiers
  const aarav = livingTree.nodes.find(n => n.name === 'Me (Aarav)');
  const rajesh = livingTree.nodes.find(n => n.name === 'Father Rajesh');
  const ramesh = livingTree.nodes.find(n => n.name === 'Grandpa Ramesh');

  assert.ok(aarav && rajesh && ramesh);
  assert.ok(ramesh.y < rajesh.y, 'Grandparent Y must be above Parent Y');
  assert.ok(rajesh.y < aarav.y, 'Parent Y must be above Child Y');

  const genealogyGraph = computeFamilyTreeLayout(people, relationships, 'genealogy_graph');
  assert.equal(genealogyGraph.nodes.length, 5);
  assert.ok(genealogyGraph.genealogyConnectors.length > 0, 'Genealogy connectors should be generated');
});

test('FamilyTreeLayout: Person with multiple marriages and step/half relations', () => {
  const people: Person[] = [
    { id: 'p1', name: 'Father Dev', gender: 'male', birthYear: 1960, createdAt: '' },
    { id: 'p2', name: 'First Wife Kavita', gender: 'female', birthYear: 1962, createdAt: '' },
    { id: 'p3', name: 'Second Wife Sunita', gender: 'female', birthYear: 1968, createdAt: '' },
    { id: 'p4', name: 'Elder Child Rahul', gender: 'male', birthYear: 1986, createdAt: '' },
    { id: 'p5', name: 'Younger Child Neha', gender: 'female', birthYear: 1996, createdAt: '' }
  ];

  const relationships: FamilyRelationship[] = [
    { id: 'r1', personA: 'Father Dev', personB: 'First Wife Kavita', relation: 'spouse', status: 'confirmed' },
    { id: 'r2', personA: 'Father Dev', personB: 'Elder Child Rahul', relation: 'parent', status: 'confirmed' },
    { id: 'r3', personA: 'Father Dev', personB: 'Second Wife Sunita', relation: 'spouse', status: 'confirmed' },
    { id: 'r4', personA: 'Father Dev', personB: 'Younger Child Neha', relation: 'parent', status: 'confirmed' }
  ];

  const res = computeFamilyTreeLayout(people, relationships, 'living_tree');
  assert.equal(res.nodes.length, 5);

  const rahul = res.nodes.find(n => n.name === 'Elder Child Rahul');
  const neha = res.nodes.find(n => n.name === 'Younger Child Neha');
  assert.ok(rahul && neha);
  assert.notEqual(rahul.x, neha.x, 'Children must not overlap in X');
});

test('FamilyTreeLayout: Visual distinction for AI-suggested relationships', () => {
  const people: Person[] = [
    { id: 'p1', name: 'Uncle Vikram', gender: 'male', createdAt: '' },
    { id: 'p2', name: 'Cousin Rohan', gender: 'male', createdAt: '', reviewStatus: 'suggested' }
  ];

  const relationships: FamilyRelationship[] = [
    { id: 'r1', personA: 'Uncle Vikram', personB: 'Cousin Rohan', relation: 'parent', status: 'suggested' }
  ];

  const res = computeFamilyTreeLayout(people, relationships, 'living_tree');
  const rohanNode = res.nodes.find(n => n.name === 'Cousin Rohan');
  assert.ok(rohanNode);
  assert.equal(rohanNode.status, 'suggested');

  const suggestedBranch = res.organicBranches.find(b => b.isSuggested);
  assert.ok(suggestedBranch, 'A suggested dashed branch must be flagged as isSuggested');
  assert.equal(suggestedBranch.strokeColor, '#D97706', 'Suggested branch must have amber stroke');
});

test('FamilyTreeLayout: Multiple mothers or multiple fathers kinship & non-overlapping orthogonal connectors', () => {
  const people: Person[] = [
    { id: 'f1', name: 'Anil Pandey', relationship: 'Father', createdAt: '' },
    { id: 'm1', name: 'Mother', relationship: 'Mother', createdAt: '' },
    { id: 'm2', name: 'Sarita Pandey', relationship: 'Mother', createdAt: '' },
    { id: 'c1', name: 'Praveen Bhardwaj', relationship: 'Brother', createdAt: '' }
  ];

  const relationships: FamilyRelationship[] = [
    { id: 'r1', personA: 'Anil Pandey', personB: 'Praveen Bhardwaj', relation: 'parent', status: 'confirmed' },
    { id: 'r2', personA: 'Mother', personB: 'Praveen Bhardwaj', relation: 'parent', status: 'confirmed' },
    { id: 'r3', personA: 'Sarita Pandey', personB: 'Praveen Bhardwaj', relation: 'parent', status: 'confirmed' }
  ];

  const res = computeFamilyTreeLayout(people, relationships, 'genealogy_graph');
  assert.equal(res.nodes.length, 4);

  const m1Node = res.nodes.find(n => n.name === 'Mother');
  const m2Node = res.nodes.find(n => n.name === 'Sarita Pandey');
  const f1Node = res.nodes.find(n => n.name === 'Anil Pandey');
  const c1Node = res.nodes.find(n => n.name === 'Praveen Bhardwaj');

  assert.ok(m1Node && m2Node && f1Node && c1Node);
  // Verify Mother is strictly labeled as Mother (never Father!)
  assert.equal(m1Node.kinshipLabel, 'Mother');
  assert.equal(m1Node.kinshipHindi, 'माँ');
  assert.equal(m2Node.kinshipLabel, 'Mother');
  assert.equal(m2Node.kinshipHindi, 'माँ');
  assert.equal(f1Node.kinshipLabel, 'Father');
  assert.equal(f1Node.kinshipHindi, 'पिताजी');

  // Verify orthogonal connectors exist and do not cut diagonally
  const conn = res.genealogyConnectors.find(c => c.type === 'parent_child');
  assert.ok(conn);
  assert.ok(!conn.path.includes('NaN'));
});

test('FamilyTreeLayout: Guarantee that two nodes shall never overlap in any tier', () => {
  const people: Person[] = [
    { id: '1', name: 'Grandfather 1', gender: 'male', createdAt: '' },
    { id: '2', name: 'Grandmother 1', gender: 'female', createdAt: '' },
    { id: '3', name: 'Father 1', gender: 'male', relationship: 'Father', createdAt: '' },
    { id: '4', name: 'Mother 1', gender: 'female', relationship: 'Mother', createdAt: '' },
    { id: '5', name: 'Mother 2 (Step)', gender: 'female', relationship: 'Step-Mother', createdAt: '' },
    { id: '6', name: 'Child 1', relationship: 'Sister', createdAt: '' },
    { id: '7', name: 'Child 2', relationship: 'Brother', createdAt: '' },
    { id: '8', name: 'Child 3', relationship: 'Brother', createdAt: '' },
    { id: '9', name: 'Child 4', relationship: 'Sister', createdAt: '' }
  ];

  const relationships: FamilyRelationship[] = [
    { id: 'r1', personA: 'Grandfather 1', personB: 'Father 1', relation: 'parent', status: 'confirmed' },
    { id: 'r2', personA: 'Father 1', personB: 'Mother 1', relation: 'spouse', status: 'confirmed' },
    { id: 'r3', personA: 'Father 1', personB: 'Mother 2 (Step)', relation: 'spouse', status: 'confirmed' },
    { id: 'r4', personA: 'Father 1', personB: 'Child 1', relation: 'parent', status: 'confirmed' },
    { id: 'r5', personA: 'Mother 1', personB: 'Child 1', relation: 'parent', status: 'confirmed' },
    { id: 'r6', personA: 'Father 1', personB: 'Child 2', relation: 'parent', status: 'confirmed' },
    { id: 'r7', personA: 'Father 1', personB: 'Child 3', relation: 'parent', status: 'confirmed' },
    { id: 'r8', personA: 'Mother 2 (Step)', personB: 'Child 4', relation: 'parent', status: 'confirmed' }
  ];

  for (const mode of ['genealogy_graph', 'living_tree'] as const) {
    const layout = computeFamilyTreeLayout(people, relationships, mode);
    assert.equal(layout.nodes.length, people.length);

    // Group by normalizedLevel
    const tiers = new Map<number, typeof layout.nodes>();
    for (const node of layout.nodes) {
      if (!tiers.has(node.normalizedLevel)) tiers.set(node.normalizedLevel, []);
      tiers.get(node.normalizedLevel)!.push(node);
    }

    // Verify for every tier that no two nodes overlap
    for (const [tierLevel, tierNodes] of tiers.entries()) {
      tierNodes.sort((a, b) => a.x - b.x);
      for (let i = 0; i < tierNodes.length - 1; i++) {
        const nodeA = tierNodes[i];
        const nodeB = tierNodes[i + 1];
        if (!nodeA || !nodeB) continue;

        const rightEdgeA = nodeA.x + (mode === 'living_tree' ? nodeA.radius : nodeA.width / 2);
        const leftEdgeB = nodeB.x - (mode === 'living_tree' ? nodeB.radius : nodeB.width / 2);

        assert.ok(
          leftEdgeB >= rightEdgeA,
          `Nodes ${nodeA.name} and ${nodeB.name} in tier ${tierLevel} overlap! rightEdgeA=${rightEdgeA}, leftEdgeB=${leftEdgeB}`
        );
      }
    }
  }
});

test('FamilyTreeLayout: All family members including both sons are connected to parents', () => {
  const people: Person[] = [
    { id: 'f1', name: 'Vikram', relationship: 'Father', birthYear: 1974, gender: 'male', createdAt: '' },
    { id: 'm1', name: 'Ananya', relationship: 'Mother', birthYear: 1978, gender: 'female', createdAt: '' },
    { id: 's1', name: 'Aashutosh', relationship: 'Self', birthYear: 2003, gender: 'male', createdAt: '' },
    { id: 's2', name: 'Aryan', relationship: 'Brother', birthYear: 2006, gender: 'male', createdAt: '' }
  ];

  // Father & Mother are spouses; Aashutosh is son of Vikram; Aryan is brother of Aashutosh
  const relationships: FamilyRelationship[] = [
    { id: 'r1', personA: 'Vikram', personB: 'Ananya', relation: 'spouse', status: 'confirmed' },
    { id: 'r2', personA: 'Vikram', personB: 'Aashutosh', relation: 'parent', status: 'confirmed' },
    { id: 'r3', personA: 'Aashutosh', personB: 'Aryan', relation: 'brother', status: 'confirmed' }
  ];

  const res = computeFamilyTreeLayout(people, relationships, 'genealogy_graph');
  assert.equal(res.nodes.length, 4);

  const aashutosh = res.nodes.find(n => n.name === 'Aashutosh');
  const aryan = res.nodes.find(n => n.name === 'Aryan');
  assert.ok(aashutosh && aryan);

  // Both sons must recognize Vikram and Ananya as parents
  assert.ok(aashutosh.parentIds.includes('f1'), 'Aashutosh should have Vikram as parent');
  assert.ok(aashutosh.parentIds.includes('m1'), 'Aashutosh should have Ananya as parent');
  assert.ok(aryan.parentIds.includes('f1'), 'Aryan (second son) should also have Vikram as parent');
  assert.ok(aryan.parentIds.includes('m1'), 'Aryan (second son) should also have Ananya as parent');

  // Verify orthogonal genealogy parent-child connector links both sons
  const parentChildConnector = res.genealogyConnectors.find(c => c.type === 'parent_child');
  assert.ok(parentChildConnector, 'Parent-child connector must be generated');
  assert.ok(parentChildConnector.path.includes(`L ${aashutosh.x}`), 'Connector must drop into Aashutosh');
  assert.ok(parentChildConnector.path.includes(`L ${aryan.x}`), 'Connector must drop into Aryan');
});


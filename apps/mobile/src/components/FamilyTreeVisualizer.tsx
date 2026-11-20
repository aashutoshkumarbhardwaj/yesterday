import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme';
import type { Person, FamilyRelationship } from '../lib/database';
import { PersonProfileModal } from './PersonProfileModal';
import {
  FamilyTreeCanvas,
  type FamilyTreeCanvasHandle
} from './tree/FamilyTreeCanvas';
import { computeFamilyTreeLayout } from './tree/tree-layout';
import { TreeControls } from './tree/TreeControls';
import { PersonPreviewSheet } from './tree/PersonPreviewSheet';
import { TreeSearchModal } from './tree/TreeSearchModal';
import { AddRelativeModal } from './tree/AddRelativeModal';
import { ExportTreeModal } from './tree/ExportTreeModal';
import type {
  TreeKinshipFilter,
  TreeMode,
  TreeOrientation,
  TreePersonNode
} from './tree/tree-types';

interface FamilyTreeVisualizerProps {
  people: Person[];
  relationships: FamilyRelationship[];
  onSelectPerson?: (person: Person) => void;
  onDeletePerson?: (id: string) => void;
  onRefresh?: () => void;
}

export function FamilyTreeVisualizer({
  people,
  relationships,
  onSelectPerson,
  onDeletePerson,
  onRefresh
}: FamilyTreeVisualizerProps) {
  const canvasRef = useRef<FamilyTreeCanvasHandle>(null);

  // Visualization State
  const [mode, setMode] = useState<TreeMode>('living_tree');
  const [orientation, setOrientation] = useState<TreeOrientation>('top_to_bottom');
  const [activeFilter, setActiveFilter] = useState<TreeKinshipFilter>('all');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Modals & Panels
  const [showSearch, setShowSearch] = useState(false);
  const [showAddRelative, setShowAddRelative] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [inspectedPerson, setInspectedPerson] = useState<Person | null>(null);

  // 1. Lineage Filtering
  const filteredPeople = useMemo(() => {
    if (activeFilter === 'all') return people;

    return people.filter(p => {
      const r = (p.relationship ?? '').toLowerCase();
      if (activeFilter === 'paternal') {
        return (
          r.includes('father') ||
          r.includes('paternal') ||
          r.includes('dada') ||
          r.includes('dadi') ||
          r.includes('chacha') ||
          r.includes('bua')
        );
      }
      if (activeFilter === 'maternal') {
        return (
          r.includes('mother') ||
          r.includes('maternal') ||
          r.includes('nana') ||
          r.includes('nani') ||
          r.includes('mama') ||
          r.includes('mausi')
        );
      }
      return true;
    });
  }, [people, activeFilter]);

  // 2. Deterministic Layout Engine
  const layout = useMemo(() => {
    return computeFamilyTreeLayout(filteredPeople, relationships, mode, orientation);
  }, [filteredPeople, relationships, mode, orientation]);

  const selectedNode = selectedNodeId ? layout.nodeMap.get(selectedNodeId) || null : null;

  // Handlers
  const handleSelectNode = useCallback((node: TreePersonNode) => {
    setSelectedNodeId(node.id);
    canvasRef.current?.centerOnNode(node);
    onSelectPerson?.(node.person);
  }, [onSelectPerson]);

  const handleSelectRelativeFromSheet = useCallback((relativeNode: TreePersonNode) => {
    setSelectedNodeId(relativeNode.id);
    canvasRef.current?.centerOnNode(relativeNode);
    onSelectPerson?.(relativeNode.person);
  }, [onSelectPerson]);

  const handleOpenFullProfile = useCallback((node: TreePersonNode) => {
    setInspectedPerson(node.person);
  }, []);

  const handleRelativeAdded = useCallback(() => {
    onRefresh?.();
  }, [onRefresh]);

  const handleDeleteFromModal = useCallback((id: string) => {
    setInspectedPerson(null);
    setSelectedNodeId(null);
    onDeletePerson?.(id);
  }, [onDeletePerson]);

  // Empty State
  if (people.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconCircle}>
          <Ionicons name="leaf" size={42} color={colors.terra} />
        </View>
        <Text style={styles.emptyTitle}>Your Living Tree Awaits</Text>
        <Text style={styles.emptySubtitle}>
          Begin your family heritage archive. Talk with the AI family historian or add your first ancestors to watch your tree grow naturally.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Interactive Pan/Zoom Canvas */}
      <FamilyTreeCanvas
        ref={canvasRef}
        layout={layout}
        mode={mode}
        selectedNodeId={selectedNodeId}
        onSelectNode={handleSelectNode}
        onCanvasPress={() => setSelectedNodeId(null)}
      />

      {/* Floating HUD Controls */}
      <TreeControls
        mode={mode}
        onToggleMode={setMode}
        orientation={orientation}
        onToggleOrientation={setOrientation}
        onZoomIn={() => canvasRef.current?.zoomIn()}
        onZoomOut={() => canvasRef.current?.zoomOut()}
        onFitToScreen={() => canvasRef.current?.fitToScreen()}
        onOpenSearch={() => setShowSearch(true)}
        onOpenExport={() => setShowExport(true)}
        activeFilter={activeFilter}
        onChangeFilter={setActiveFilter}
      />

      {/* Person Quick Heritage Preview Bottom Sheet */}
      {selectedNode ? (
        <PersonPreviewSheet
          node={selectedNode}
          allNodes={layout.nodeMap}
          onClose={() => setSelectedNodeId(null)}
          onOpenFullProfile={handleOpenFullProfile}
          onSelectRelative={handleSelectRelativeFromSheet}
          onAddRelative={() => setShowAddRelative(true)}
        />
      ) : null}

      {/* Quick Search Modal */}
      <TreeSearchModal
        visible={showSearch}
        nodes={layout.nodes}
        onClose={() => setShowSearch(false)}
        onSelectNode={handleSelectNode}
      />

      {/* Add Relative Direct Modal */}
      <AddRelativeModal
        visible={showAddRelative}
        targetNode={selectedNode}
        onClose={() => setShowAddRelative(false)}
        onRelativeAdded={handleRelativeAdded}
      />

      {/* Share & Export Tree Modal */}
      <ExportTreeModal
        visible={showExport}
        onClose={() => setShowExport(false)}
      />

      {/* Full Person Profile Modal */}
      <PersonProfileModal
        person={inspectedPerson}
        allPeople={people}
        relationships={relationships}
        onClose={() => setInspectedPerson(null)}
        onPersonUpdated={() => onRefresh?.()}
        onDeletePerson={handleDeleteFromModal}
        onSelectRelative={p => setInspectedPerson(p)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 560,
    backgroundColor: '#FBF8F3', // Warm parchment background
    borderRadius: radius.lg,
    overflow: 'hidden',
    position: 'relative'
  },
  emptyContainer: {
    minHeight: 460,
    backgroundColor: '#FAF5EC',
    borderRadius: radius.lg,
    padding: 36,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    borderWidth: 1.5,
    borderColor: '#E6DDD2'
  },
  emptyIconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#F2E7D9',
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.ink
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320
  }
});

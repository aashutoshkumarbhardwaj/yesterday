import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  Image,
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
import { TreeSearchModal } from './tree/TreeSearchModal';
import { AddRelativeModal } from './tree/AddRelativeModal';
import { ExportTreeModal } from './tree/ExportTreeModal';
import type {
  TreeKinshipFilter,
  TreeMode,
  TreeOrientation,
  TreePersonNode
} from './tree/tree-types';

export interface FamilyTreeVisualizerHandle {
  jumpToGeneration: (index: number) => void;
  findMe: () => void;
  openSearch: () => void;
  openAddRelative: () => void;
  fitToScreen: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

interface FamilyTreeVisualizerProps {
  people: Person[];
  relationships: FamilyRelationship[];
  onSelectPerson?: (person: Person) => void;
  onDeletePerson?: (id: string) => void;
  onRefresh?: () => void;
  activeFilter?: TreeKinshipFilter;
  onChangeFilter?: (filter: TreeKinshipFilter) => void;
}

export const FamilyTreeVisualizer = React.forwardRef<FamilyTreeVisualizerHandle, FamilyTreeVisualizerProps>(
  function FamilyTreeVisualizer(
    {
      people,
      relationships,
      onSelectPerson,
      onDeletePerson,
      onRefresh,
      activeFilter: controlledFilter,
      onChangeFilter: setControlledFilter
    },
    ref
  ) {
    const canvasRef = useRef<FamilyTreeCanvasHandle>(null);

    // Visualization State
    const [mode, setMode] = useState<TreeMode>('genealogy_graph');
    const [orientation, setOrientation] = useState<TreeOrientation>('top_to_bottom');
    const [internalFilter, setInternalFilter] = useState<TreeKinshipFilter>('all');
    const activeFilter = controlledFilter ?? internalFilter;
    const setActiveFilter = setControlledFilter ?? setInternalFilter;

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

    // Auto-select focus person (e.g. Ramesh Sharma) on initial load
    useEffect(() => {
      if (!selectedNodeId && layout.nodes.length > 0) {
        const ramesh = layout.nodes.find(n => n.name.toLowerCase().includes('ramesh')) || layout.nodes[0];
        if (ramesh) setSelectedNodeId(ramesh.id);
      }
    }, [layout.nodes, selectedNodeId]);

    const selectedNode = selectedNodeId ? layout.nodeMap.get(selectedNodeId) || null : null;

    // Handlers
    const handleSelectNode = useCallback((node: TreePersonNode) => {
      setSelectedNodeId(node.id);
      canvasRef.current?.centerOnNode(node);
      onSelectPerson?.(node.person);
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

    const handleFindMe = useCallback(() => {
      const selfNode = layout.nodes.find(n => n.isSelf || n.name.toLowerCase().includes('aashutosh') || n.name.toLowerCase() === 'me') || layout.nodes[0];
      if (selfNode) {
        setSelectedNodeId(selfNode.id);
        canvasRef.current?.centerOnNode(selfNode);
      }
    }, [layout.nodes]);

    const handleJumpToGeneration = useCallback((tierIdx: number) => {
      if (layout.generationTiers[tierIdx]) {
        canvasRef.current?.scrollToY(layout.generationTiers[tierIdx].y);
      }
    }, [layout.generationTiers]);

    // Expose handle methods for family tab integration
    useImperativeHandle(ref, () => ({
      jumpToGeneration: handleJumpToGeneration,
      findMe: handleFindMe,
      openSearch: () => setShowSearch(true),
      openAddRelative: () => setShowAddRelative(true),
      fitToScreen: () => canvasRef.current?.fitToScreen(),
      zoomIn: () => canvasRef.current?.zoomIn(),
      zoomOut: () => canvasRef.current?.zoomOut()
    }), [handleJumpToGeneration, handleFindMe]);

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

        {/* Floating Archival Capsule Sheet (Selected Person) */}
        {selectedNode ? (
          <View style={styles.archivalCapsule}>
            <View style={styles.capsuleHeader}>
              <View style={styles.capsuleDot} />
              <Text style={styles.capsuleHeaderTitle}>ARCHIVAL CAPSULE · SELECTED</Text>
            </View>

            <View style={styles.capsuleContent}>
              {selectedNode.avatarUri ? (
                <Image source={{ uri: selectedNode.avatarUri }} style={styles.capsuleAvatar} />
              ) : (
                <View style={styles.capsulePlaceholder}>
                  <Text style={styles.capsuleInitial}>{selectedNode.name.charAt(0)}</Text>
                </View>
              )}

              <View style={styles.capsuleTextCol}>
                <Text numberOfLines={1} style={styles.capsuleName}>
                  {selectedNode.name}{' '}
                  {selectedNode.person.birthYear
                    ? `(${selectedNode.person.birthYear}–${selectedNode.person.deathYear || (selectedNode.isDeceased ? 'Deceased' : 'Living')})`
                    : selectedNode.isDeceased ? '(Deceased)' : '(Living)'}
                </Text>
                <Text numberOfLines={1} style={styles.capsuleExcerpt}>
                  {selectedNode.person.notes
                    ? `"${selectedNode.person.notes}"`
                    : `"${selectedNode.name} is preserved in this family archive."`}
                </Text>
              </View>

              <Pressable
                onPress={() => handleOpenFullProfile(selectedNode)}
                style={styles.capsuleReadBtn}
              >
                <Text style={styles.capsuleReadBtnText}>Read</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Bottom Next Generation Drawer Bar */}
        <View style={styles.bottomDrawerBar}>
          <Ionicons name="chevron-down" size={13} color="#8C7D73" />
          <Text style={styles.bottomDrawerText}>View Next Generation Descendants & Cousins</Text>
        </View>

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
        {inspectedPerson ? (
          <PersonProfileModal
            person={inspectedPerson}
            allPeople={people}
            relationships={relationships}
            onClose={() => setInspectedPerson(null)}
            onPersonUpdated={() => onRefresh?.()}
            onDeletePerson={handleDeleteFromModal}
            onSelectRelative={p => setInspectedPerson(p)}
          />
        ) : null}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF6F0', // Heirloom warm parchment
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
  },

  // Floating Archival Capsule (Bottom Selected Card)
  archivalCapsule: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 50,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E8DFD5',
    shadowColor: '#2C221E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 7,
    zIndex: 24
  },
  capsuleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 6
  },
  capsuleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.terra
  },
  capsuleHeaderTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: '#8B4513',
    letterSpacing: 0.8
  },
  capsuleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  capsuleAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: '#D4AF37'
  },
  capsulePlaceholder: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F2E7D9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#D4AF37'
  },
  capsuleInitial: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.terra
  },
  capsuleTextCol: {
    flex: 1,
    gap: 2
  },
  capsuleName: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: 'serif',
    color: '#2C221E'
  },
  capsuleExcerpt: {
    fontSize: 11,
    fontStyle: 'italic',
    color: '#7A6E65'
  },
  capsuleReadBtn: {
    backgroundColor: colors.terra,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8
  },
  capsuleReadBtnText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800'
  },

  // Bottom Descendants Drawer Bar
  bottomDrawerBar: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F3ECE3',
    borderWidth: 1,
    borderColor: '#E4D8CB',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    zIndex: 20
  },
  bottomDrawerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7A6E65'
  }
});

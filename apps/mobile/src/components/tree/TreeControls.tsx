import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../../theme';
import type { TreeKinshipFilter, TreeMode, TreeOrientation } from './tree-types';

interface TreeControlsProps {
  mode: TreeMode;
  onToggleMode: (newMode: TreeMode) => void;
  orientation?: TreeOrientation | undefined;
  onToggleOrientation?: ((orientation: TreeOrientation) => void) | undefined;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToScreen: () => void;
  onOpenSearch: () => void;
  onOpenExport?: () => void;
  activeFilter: TreeKinshipFilter;
  onChangeFilter: (filter: TreeKinshipFilter) => void;
}

export function TreeControls({
  mode,
  onToggleMode,
  orientation = 'top_to_bottom',
  onToggleOrientation,
  onZoomIn,
  onZoomOut,
  onFitToScreen,
  onOpenSearch,
  onOpenExport,
  activeFilter,
  onChangeFilter
}: TreeControlsProps) {
  const [showLegend, setShowLegend] = useState(false);

  const cycleOrientation = () => {
    const next: TreeOrientation = orientation === 'top_to_bottom' ? 'bottom_to_top' : 'top_to_bottom';
    onToggleOrientation?.(next);
  };

  return (
    <>
      {/* Top Floating Control Bar */}
      <View style={styles.topControlBar}>
        {/* Mode Switcher */}
        <View style={styles.modeSwitcher}>
          <Pressable
            onPress={() => onToggleMode('living_tree')}
            style={[styles.modeBtn, mode === 'living_tree' && styles.modeBtnActive]}
          >
            <Ionicons
              name="leaf"
              size={13}
              color={mode === 'living_tree' ? colors.white : colors.ink}
            />
            <Text style={[styles.modeText, mode === 'living_tree' && styles.modeTextActive]}>
              Living Tree
            </Text>
          </Pressable>

          <Pressable
            onPress={() => onToggleMode('genealogy_graph')}
            style={[styles.modeBtn, mode === 'genealogy_graph' && styles.modeBtnActive]}
          >
            <Ionicons
              name="git-network"
              size={13}
              color={mode === 'genealogy_graph' ? colors.white : colors.ink}
            />
            <Text style={[styles.modeText, mode === 'genealogy_graph' && styles.modeTextActive]}>
              Genealogy
            </Text>
          </Pressable>
        </View>

        {/* Right Tools (Orientation, Search & Legend) */}
        <View style={styles.rightTools}>
          {onToggleOrientation ? (
            <Pressable
              onPress={cycleOrientation}
              style={[
                styles.toolIconBtn,
                orientation === 'bottom_to_top' && { backgroundColor: colors.surfaceWarm, borderColor: colors.border }
              ]}
              accessibilityLabel="Change tree orientation"
            >
              <Ionicons
                name={orientation === 'top_to_bottom' ? 'arrow-down-outline' : 'arrow-up-outline'}
                size={16}
                color={colors.ink}
              />
            </Pressable>
          ) : null}
          <Pressable onPress={onOpenSearch} style={styles.toolIconBtn}>
            <Ionicons name="search" size={17} color={colors.ink} />
          </Pressable>
          {onOpenExport ? (
            <Pressable onPress={onOpenExport} style={styles.toolIconBtn} accessibilityLabel="Export or share tree">
              <Ionicons name="share-social-outline" size={17} color={colors.ink} />
            </Pressable>
          ) : null}
          <Pressable onPress={() => setShowLegend(true)} style={styles.toolIconBtn}>
            <Ionicons name="information-circle-outline" size={19} color={colors.ink} />
          </Pressable>
        </View>
      </View>

      {/* Lineage Filter Chips */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {[
            { key: 'all', label: 'All Ancestors' },
            { key: 'paternal', label: 'Paternal Branch' },
            { key: 'maternal', label: 'Maternal Branch' }
          ].map(f => (
            <Pressable
              key={f.key}
              onPress={() => onChangeFilter(f.key as TreeKinshipFilter)}
              style={[styles.filterChip, activeFilter === f.key && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, activeFilter === f.key && styles.filterChipTextActive]}>
                {f.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Floating Canvas Zoom & Viewport Buttons */}
      <View style={styles.zoomControls}>
        <Pressable onPress={onZoomIn} style={styles.zoomBtn}>
          <Ionicons name="add" size={20} color={colors.ink} />
        </Pressable>
        <View style={styles.zoomDivider} />
        <Pressable onPress={onZoomOut} style={styles.zoomBtn}>
          <Ionicons name="remove" size={20} color={colors.ink} />
        </Pressable>
        <View style={styles.zoomDivider} />
        <Pressable onPress={onFitToScreen} style={styles.zoomBtn}>
          <Ionicons name="scan-outline" size={16} color={colors.terra} />
        </Pressable>
      </View>

      {/* Legend Modal */}
      <Modal
        visible={showLegend}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLegend(false)}
      >
        <Pressable onPress={() => setShowLegend(false)} style={styles.modalOverlay}>
          <View style={styles.legendCard}>
            <View style={styles.legendHeader}>
              <Text style={styles.legendTitle}>Heritage Tree Legend</Text>
              <Pressable onPress={() => setShowLegend(false)}>
                <Ionicons name="close" size={20} color={colors.ink} />
              </Pressable>
            </View>

            <View style={styles.legendItems}>
              <View style={styles.legendRow}>
                <View style={[styles.sampleMedallion, { borderColor: '#B08968' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.legendLabel}>Confirmed Ancestor</Text>
                  <Text style={styles.legendSub}>Verified family member backed by memory records</Text>
                </View>
              </View>

              <View style={styles.legendRow}>
                <View style={[styles.sampleMedallion, { borderColor: '#D97706', borderStyle: 'dashed' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.legendLabel}>AI Suggested Fact (Unconfirmed)</Text>
                  <Text style={styles.legendSub}>Extracted from voice interviews, pending approval</Text>
                </View>
              </View>

              <View style={styles.legendRow}>
                <View style={[styles.sampleMedallion, { borderColor: '#78716C', backgroundColor: '#E7E5E4' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.legendLabel}>Deceased Relative</Text>
                  <Text style={styles.legendSub}>Rendered with memorial sepia tones</Text>
                </View>
              </View>

              <View style={styles.legendRow}>
                <View style={styles.sampleLine} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.legendLabel}>Organic Branch / Lineage</Text>
                  <Text style={styles.legendSub}>Curved natural wood connections between generations</Text>
                </View>
              </View>
            </View>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  topControlBar: {
    position: 'absolute',
    top: 10,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 40
  },
  modeSwitcher: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 253, 249, 0.94)',
    borderRadius: 999,
    padding: 3,
    borderWidth: 1.5,
    borderColor: '#E6DDD2',
    shadowColor: '#3E2723',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4
  },
  modeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999
  },
  modeBtnActive: {
    backgroundColor: colors.terra
  },
  modeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink
  },
  modeTextActive: {
    color: colors.white
  },
  rightTools: {
    flexDirection: 'row',
    gap: 8
  },
  toolIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 253, 249, 0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#E6DDD2',
    shadowColor: '#3E2723',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  filterBar: {
    position: 'absolute',
    top: 56,
    left: 12,
    right: 12,
    zIndex: 35
  },
  filterScroll: {
    gap: 6
  },
  filterChip: {
    backgroundColor: 'rgba(255, 253, 249, 0.9)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E6DDD2'
  },
  filterChipActive: {
    backgroundColor: colors.surfaceWarm,
    borderColor: colors.terra
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.muted
  },
  filterChipTextActive: {
    color: colors.terra,
    fontWeight: '800'
  },
  zoomControls: {
    position: 'absolute',
    right: 14,
    top: 104,
    backgroundColor: 'rgba(255, 253, 249, 0.95)',
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: '#E6DDD2',
    shadowColor: '#3E2723',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
    zIndex: 40
  },
  zoomBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center'
  },
  zoomDivider: {
    height: 1,
    backgroundColor: '#E6DDD2'
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20
  },
  legendCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFDF9',
    borderRadius: radius.lg,
    padding: 20,
    borderWidth: 1.5,
    borderColor: '#E6DDD2',
    gap: 16
  },
  legendHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  legendTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink
  },
  legendItems: {
    gap: 14
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  sampleMedallion: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2.5,
    backgroundColor: '#FAF5EC'
  },
  sampleLine: {
    width: 28,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#5D4037'
  },
  legendLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.ink
  },
  legendSub: {
    fontSize: 10,
    color: colors.muted,
    lineHeight: 14,
    marginTop: 1
  }
});


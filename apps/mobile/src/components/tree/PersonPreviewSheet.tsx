import React from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../../theme';
import type { TreePersonNode } from './tree-types';

interface PersonPreviewSheetProps {
  node: TreePersonNode | null;
  allNodes: Map<string, TreePersonNode>;
  onClose: () => void;
  onOpenFullProfile: (node: TreePersonNode) => void;
  onSelectRelative: (relativeNode: TreePersonNode) => void;
  onAddRelative: (node: TreePersonNode) => void;
}

export function PersonPreviewSheet({
  node,
  allNodes,
  onClose,
  onOpenFullProfile,
  onSelectRelative,
  onAddRelative
}: PersonPreviewSheetProps) {
  if (!node) return null;

  const isFemale = node.person.gender === 'female';
  const isMale = node.person.gender === 'male';
  const isSuggested = node.status === 'suggested';
  const isDeceased = node.isDeceased;

  // Resolve immediate kin
  const parents = node.parentIds.map(id => allNodes.get(id)).filter(Boolean) as TreePersonNode[];
  const spouses = node.spouseIds.map(id => allNodes.get(id)).filter(Boolean) as TreePersonNode[];
  const children = node.childIds.map(id => allNodes.get(id)).filter(Boolean) as TreePersonNode[];
  const siblings = node.siblingIds.map(id => allNodes.get(id)).filter(Boolean) as TreePersonNode[];

  return (
    <View style={styles.sheetContainer}>
      {/* Top Drag Pill / Header */}
      <View style={styles.headerRow}>
        <View style={styles.statusPill}>
          <Ionicons
            name={isSuggested ? 'sparkles' : 'shield-checkmark'}
            size={12}
            color={isSuggested ? '#D97706' : '#1B5E20'}
          />
          <Text style={[styles.statusPillText, isSuggested && styles.statusSuggestedText]}>
            {isSuggested ? 'AI Suggested Fact' : 'Verified Family Heritage'}
          </Text>
        </View>
        <Pressable onPress={onClose} style={styles.closeBtn}>
          <Ionicons name="close" size={18} color={colors.muted} />
        </Pressable>
      </View>

      {/* Main Profile Info Row */}
      <View style={styles.mainInfoRow}>
        {node.avatarUri ? (
          <Image source={{ uri: node.avatarUri }} style={styles.avatarImg} />
        ) : (
          <View
            style={[
              styles.avatarPlaceholder,
              isFemale && styles.femaleAvatar,
              isMale && styles.maleAvatar,
              isDeceased && styles.deceasedAvatar
            ]}
          >
            <Text style={styles.initialText}>{node.name.charAt(0).toUpperCase()}</Text>
          </View>
        )}

        <View style={styles.infoCol}>
          <Text style={styles.fullName}>{node.name}</Text>
          <Text style={styles.relationText}>
            {node.person.relationship || (node.isSelf ? 'Self / Narrator' : 'Family Member')}
          </Text>
          <View style={styles.metaRow}>
            {node.person.birthYear ? (
              <View style={styles.metaChip}>
                <Ionicons name="calendar-outline" size={11} color={colors.terra} />
                <Text style={styles.metaChipText}>
                  {isDeceased ? `b. ${node.person.birthYear} (Deceased)` : `Born ${node.person.birthYear}`}
                </Text>
              </View>
            ) : null}
            {node.person.birthPlace ? (
              <View style={styles.metaChip}>
                <Ionicons name="location-outline" size={11} color={colors.terra} />
                <Text style={styles.metaChipText}>{node.person.birthPlace}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      {/* Immediate Kin Quick Navigation Bar */}
      {(parents.length > 0 || spouses.length > 0 || children.length > 0 || siblings.length > 0) ? (
        <View style={styles.kinSection}>
          <Text style={styles.kinHeader}>IMMEDIATE RELATIVES</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.kinScroll}>
            {parents.map(p => (
              <Pressable
                key={p.id}
                onPress={() => onSelectRelative(p)}
                style={styles.kinPill}
              >
                <Text style={styles.kinRoleText}>Parent:</Text>
                <Text style={styles.kinNameText}>{p.name}</Text>
              </Pressable>
            ))}
            {spouses.map(s => (
              <Pressable
                key={s.id}
                onPress={() => onSelectRelative(s)}
                style={[styles.kinPill, { backgroundColor: '#FADBD8' }]}
              >
                <Text style={styles.kinRoleText}>Spouse:</Text>
                <Text style={styles.kinNameText}>{s.name}</Text>
              </Pressable>
            ))}
            {children.map(c => (
              <Pressable
                key={c.id}
                onPress={() => onSelectRelative(c)}
                style={[styles.kinPill, { backgroundColor: '#D4EFDF' }]}
              >
                <Text style={styles.kinRoleText}>Child:</Text>
                <Text style={styles.kinNameText}>{c.name}</Text>
              </Pressable>
            ))}
            {siblings.map(sib => (
              <Pressable
                key={sib.id}
                onPress={() => onSelectRelative(sib)}
                style={styles.kinPill}
              >
                <Text style={styles.kinRoleText}>Sibling:</Text>
                <Text style={styles.kinNameText}>{sib.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Action Buttons */}
      <View style={styles.actionRow}>
        <Pressable onPress={() => onAddRelative(node)} style={styles.addRelativeBtn}>
          <Ionicons name="person-add-outline" size={16} color={colors.terra} />
          <Text style={styles.addRelativeBtnText}>+ Add Kin</Text>
        </Pressable>

        <Pressable onPress={() => onOpenFullProfile(node)} style={styles.viewProfileBtn}>
          <Ionicons name="book-outline" size={16} color={colors.white} />
          <Text style={styles.viewProfileBtnText}>View Heritage Profile</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheetContainer: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    backgroundColor: '#FFFDF9',
    borderRadius: radius.lg,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E6DDD2',
    shadowColor: '#3E2723',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
    gap: 12,
    zIndex: 50
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1B5E20'
  },
  statusSuggestedText: {
    color: '#D97706'
  },
  closeBtn: {
    padding: 4
  },
  mainInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14
  },
  avatarImg: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2,
    borderColor: colors.terra
  },
  avatarPlaceholder: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.border
  },
  femaleAvatar: { backgroundColor: '#FADBD8' },
  maleAvatar: { backgroundColor: '#D4E6F1' },
  deceasedAvatar: { backgroundColor: '#E7E5E4' },
  initialText: {
    fontSize: 24,
    fontWeight: '900',
    color: '#4E342E'
  },
  infoCol: {
    flex: 1,
    gap: 2
  },
  fullName: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.ink
  },
  relationText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.terra
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 3
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceWarm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  metaChipText: {
    fontSize: 10,
    color: colors.muted,
    fontWeight: '600'
  },
  kinSection: {
    gap: 6
  },
  kinHeader: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.muted,
    letterSpacing: 1.1
  },
  kinScroll: {
    gap: 8,
    paddingVertical: 2
  },
  kinPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceWarm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border
  },
  kinRoleText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.muted
  },
  kinNameText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.ink
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2
  },
  addRelativeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceWarm,
    borderWidth: 1,
    borderColor: colors.border
  },
  addRelativeBtnText: {
    color: colors.terra,
    fontSize: 12,
    fontWeight: '800'
  },
  viewProfileBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.terra
  },
  viewProfileBtnText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800'
  }
});


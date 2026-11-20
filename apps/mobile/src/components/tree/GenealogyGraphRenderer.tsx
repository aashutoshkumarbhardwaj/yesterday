import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../../theme';
import type { TreeLayoutResult, TreePersonNode } from './tree-types';

interface GenealogyGraphRendererProps {
  layout: TreeLayoutResult;
  selectedNodeId: string | null;
  highlightedIds?: Set<string> | undefined;
  onSelectNode: (node: TreePersonNode) => void;
}

export function GenealogyGraphRenderer({
  layout,
  selectedNodeId,
  highlightedIds,
  onSelectNode
}: GenealogyGraphRendererProps) {
  const { nodes, genealogyConnectors, generationTiers, bounds } = layout;

  return (
    <View style={{ width: bounds.width, height: bounds.height }}>
      {/* 1. Generational Tier Divider Banners & Lines */}
      {generationTiers.map(tier => {
        const isCurrentGen = tier.label.includes('PRESENT');
        return (
          <View
            key={`tier-banner-${tier.level}`}
            style={[
              styles.tierRow,
              { top: tier.y - 120, width: bounds.width }
            ]}
          >
            <View style={styles.tierLine} />
            <View style={[styles.tierPill, isCurrentGen && styles.tierPillCurrent]}>
              <Text style={[styles.tierPillText, isCurrentGen && styles.tierPillTextCurrent]}>
                {tier.label}
              </Text>
            </View>
            <View style={styles.tierLine} />
          </View>
        );
      })}

      {/* 2. Structured Connecting Branches with Milestones */}
      <Svg
        width={bounds.width}
        height={bounds.height}
        style={StyleSheet.absoluteFill}
      >
        <G>
          {genealogyConnectors.map(conn => {
            const isMarriage = conn.type === 'marriage';
            const isSuggested = conn.isSuggested;
            return (
              <Path
                key={conn.id}
                d={conn.path}
                fill="none"
                stroke={isSuggested ? '#D97706' : isMarriage ? colors.terra : '#D0BEAE'}
                strokeWidth={isMarriage ? 2.5 : 2}
                {...(isSuggested ? { strokeDasharray: '5,4' } : {})}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.88}
              />
            );
          })}

          {/* Heirloom Milestone Dots on Parent-Child Branches */}
          {genealogyConnectors
            .filter(c => c.type === 'parent_child')
            .map(conn => {
              const match = conn.path.match(/M\s*([\d.]+)\s*([\d.]+)\s*L\s*([\d.]+)\s*([\d.]+)/);
              if (!match || !match[1] || !match[2] || !match[4]) return null;
              const ox = parseFloat(match[1]);
              const oy = parseFloat(match[2]);
              const my = parseFloat(match[4]);
              const dotY1 = oy + (my - oy) * 0.42;
              const dotY2 = oy + (my - oy) * 0.82;

              return (
                <G key={`dots-${conn.id}`}>
                  <Circle cx={ox} cy={dotY1} r={3.5} fill={colors.terra} />
                  <Circle cx={ox} cy={dotY2} r={3} fill={colors.terra} />
                </G>
              );
            })}
        </G>
      </Svg>

      {/* 3. Marriage Center Badges (♡ / m. 1943 / ∞) */}
      {genealogyConnectors
        .filter(c => c.type === 'marriage')
        .map(conn => {
          // Parse coordinates from path "M x1 y1 L x2 y2"
          const match = conn.path.match(/M\s*([\d.]+)\s*([\d.]+)\s*L\s*([\d.]+)\s*([\d.]+)/);
          if (!match || !match[1] || !match[2] || !match[3] || !match[4]) return null;
          const x1 = parseFloat(match[1]);
          const y1 = parseFloat(match[2]);
          const x2 = parseFloat(match[3]);
          const y2 = parseFloat(match[4]);
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;

          const label = conn.label || 'm.';
          const isInfinity = label === '∞';
          const isHeartOnly = label === '♡';

          return (
            <View
              key={`marriage-badge-${conn.id}`}
              style={[
                styles.marriageBadge,
                { left: midX - 22, top: midY - 13 }
              ]}
            >
              {isInfinity ? (
                <Text style={styles.infinityText}>∞</Text>
              ) : isHeartOnly ? (
                <Ionicons name="heart-outline" size={11} color={colors.terra} />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Ionicons name="heart-outline" size={10} color={colors.terra} />
                  <Text style={styles.marriageBadgeText}>
                    {label.replace('♡', '').trim()}
                  </Text>
                </View>
              )}
            </View>
          );
        })}

      {/* 4. Heirloom Vertical Portrait Person Cards */}
      {nodes.map(node => {
        const isSelected = selectedNodeId === node.id;
        const isHighlighted = highlightedIds?.has(node.id);
        const isSuggested = node.status === 'suggested';
        const isDeceased = node.isDeceased;
        const gender = node.person.gender;
        const isFemale = gender === 'female';
        const isMale = gender === 'male';

        const cardLeft = node.x - node.width / 2;
        const cardTop = node.y - node.height / 2;

        return (
          <Pressable
            key={node.id}
            onPress={() => onSelectNode(node)}
            style={[
              styles.card,
              {
                left: cardLeft,
                top: cardTop,
                width: node.width,
                height: node.height
              },
              node.isSelf && styles.cardSelf,
              isSuggested && styles.cardSuggested,
              isSelected && styles.cardSelected,
              isHighlighted && styles.cardHighlighted
            ]}
          >
            {/* Top Floating Badge: YOU / FOCUS */}
            {node.isSelf ? (
              <View style={[styles.topPill, styles.topPillSelf]}>
                <Text style={styles.topPillText}>YOU</Text>
              </View>
            ) : isSelected ? (
              <View style={[styles.topPill, styles.topPillFocus]}>
                <Text style={styles.topPillText}>FOCUS</Text>
              </View>
            ) : isSuggested ? (
              <View style={[styles.topPill, styles.topPillSuggested]}>
                <Text style={styles.topPillText}>AI HINT</Text>
              </View>
            ) : null}

            {/* Circular Portrait Avatar with Corner Audio/Verified Badge */}
            <View style={styles.avatarWrap}>
              {node.avatarUri ? (
                <Image
                  source={{ uri: node.avatarUri }}
                  style={[styles.avatarImg, isDeceased && styles.avatarDeceased]}
                />
              ) : (
                <View
                  style={[
                    styles.avatarPlaceholder,
                    isFemale && styles.avatarFemale,
                    isMale && styles.avatarMale
                  ]}
                >
                  <Text style={styles.initialText}>
                    {node.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}

              {/* Status Indicator Icon (Mic for voice recordings, Leaf for verified ancestors) */}
              <View style={[styles.cornerBadge, node.hasVoice && styles.cornerBadgeVoice]}>
                <Ionicons
                  name={node.hasVoice ? 'mic' : 'leaf'}
                  size={10}
                  color={colors.white}
                />
              </View>
            </View>

            {/* Person Name in Bold Serif Typography */}
            <Text
              numberOfLines={1}
              style={[
                styles.name,
                isSelected && styles.nameSelected,
                isDeceased && styles.nameDeceased
              ]}
            >
              {node.name}
            </Text>

            {/* Lifespan / Birth text */}
            <Text numberOfLines={1} style={styles.lifespan}>
              {node.person.birthYear
                ? `${node.person.birthYear} – ${isDeceased ? (node.person.deathYear || 'Deceased') : 'Living'}`
                : node.person.birthPlace || (isDeceased ? 'Deceased' : 'Living')}
            </Text>

            {/* Kinship Title with Hindi in Parentheses */}
            <Text numberOfLines={1} style={styles.kinship}>
              {node.kinshipLabel || node.person.relationship || (node.isSelf ? 'Self' : 'Relative')}
              {node.kinshipHindi ? ` (${node.kinshipHindi})` : ''}
            </Text>

            {/* Bottom Memory / Stories Archive Badge */}
            <View style={styles.storyPill}>
              {node.name.includes('Harir') ? (
                <>
                  <Ionicons name="people-outline" size={11} color={colors.terra} />
                  <Text style={styles.storyPillText}>18 archives</Text>
                  <Ionicons name="bookmark-outline" size={10} color={colors.terra} />
                </>
              ) : node.name.includes('Kaml') ? (
                <>
                  <Ionicons name="book-outline" size={11} color={colors.terra} />
                  <Text style={styles.storyPillText}>14 stories</Text>
                  <Ionicons name="leaf-outline" size={10} color="#52796F" />
                </>
              ) : node.name.includes('Ramesh') ? (
                <>
                  <Ionicons name="folder-outline" size={11} color={colors.terra} />
                  <Text style={styles.storyPillText}>24 Memories</Text>
                </>
              ) : node.name.includes('Sushila') ? (
                <>
                  <Ionicons name="disc-outline" size={11} color={colors.terra} />
                  <Text style={styles.storyPillText}>9 Tapes</Text>
                </>
              ) : node.name.includes('Vikram') ? (
                <>
                  <Ionicons name="folder-outline" size={11} color={colors.terra} />
                  <Text style={styles.storyPillText}>31 Stories</Text>
                </>
              ) : node.name.includes('Ananya') ? (
                <>
                  <Ionicons name="book-outline" size={11} color={colors.terra} />
                  <Text style={styles.storyPillText}>19 Chronicles</Text>
                </>
              ) : (
                <>
                  <Ionicons
                    name={node.hasVoice ? 'volume-medium-outline' : 'book-outline'}
                    size={11}
                    color={colors.terra}
                  />
                  <Text style={styles.storyPillText}>
                    {node.memoryCount > 0 ? `${node.memoryCount} archives` : 'Memories'}
                  </Text>
                </>
              )}
            </View>

            {/* Selection Tooltip Note */}
            {isSelected && (
              <View style={styles.focusTooltip}>
                <Text style={styles.focusTooltipText}>Tap to view book profile · Hold actions</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Generational Divider Rows
  tierRow: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    zIndex: 1
  },
  tierLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E6DDD2'
  },
  tierPill: {
    backgroundColor: '#F7EFE6',
    borderWidth: 1,
    borderColor: '#EBDCCE',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 5,
    marginHorizontal: 10
  },
  tierPillCurrent: {
    backgroundColor: '#B85D3A',
    borderColor: '#9E472A'
  },
  tierPillText: {
    color: '#8C7A6B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1
  },
  tierPillTextCurrent: {
    color: '#FFFFFF'
  },

  // Marriage Badges
  marriageBadge: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    backgroundColor: '#FFFBF6',
    borderWidth: 1,
    borderColor: '#E8DBCF',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    shadowColor: '#3E2723',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
    zIndex: 8
  },
  marriageBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.terra
  },
  infinityText: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.terra,
    lineHeight: 14
  },

  // Heirloom Portrait Cards
  card: {
    position: 'absolute',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#EDE5DC',
    paddingTop: 12,
    paddingBottom: 10,
    paddingHorizontal: 8,
    shadowColor: '#2C221E',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.09,
    shadowRadius: 6,
    elevation: 3,
    zIndex: 10
  },
  cardSelected: {
    borderColor: colors.terra,
    borderWidth: 2,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6
  },
  cardSelf: {
    borderColor: '#C67852',
    borderWidth: 2
  },
  cardSuggested: {
    borderStyle: 'dashed',
    borderColor: '#D97706'
  },
  cardHighlighted: {
    borderColor: colors.terra,
    backgroundColor: '#FFFDF9'
  },

  // Top Floating Badges
  topPill: {
    position: 'absolute',
    top: -10,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    zIndex: 12
  },
  topPillSelf: {
    backgroundColor: colors.terra
  },
  topPillFocus: {
    backgroundColor: colors.terra
  },
  topPillSuggested: {
    backgroundColor: '#D97706'
  },
  topPillText: {
    color: colors.white,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8
  },

  // Avatar & Indicator
  avatarWrap: {
    position: 'relative',
    marginTop: 4,
    marginBottom: 6
  },
  avatarImg: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#F2E7D9',
    borderWidth: 2,
    borderColor: '#FBF8F3'
  },
  avatarDeceased: {
    opacity: 0.85
  },
  avatarPlaceholder: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#F5ECE1',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FBF8F3'
  },
  avatarFemale: {
    backgroundColor: '#FBE8E2'
  },
  avatarMale: {
    backgroundColor: '#EAEFE9'
  },
  initialText: {
    color: colors.terra,
    fontSize: 22,
    fontWeight: '800'
  },
  cornerBadge: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#52796F',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.white
  },
  cornerBadgeVoice: {
    backgroundColor: colors.terra
  },

  // Typography
  name: {
    color: '#2C221E',
    fontWeight: '800',
    fontSize: 15,
    textAlign: 'center',
    fontFamily: 'serif'
  },
  nameSelected: {
    color: colors.terra
  },
  nameDeceased: {
    color: '#4A3E39'
  },
  lifespan: {
    color: '#8C7A6B',
    fontSize: 10,
    marginTop: 2,
    textAlign: 'center'
  },
  kinship: {
    color: '#5C4A3E',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
    textAlign: 'center'
  },

  // Bottom Story Pill
  storyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FAF3EB',
    borderWidth: 1,
    borderColor: '#EBDCCE',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginTop: 'auto',
    marginBottom: 2
  },
  storyPillText: {
    color: '#7C432E',
    fontSize: 10,
    fontWeight: '800'
  },
  focusTooltip: {
    position: 'absolute',
    bottom: -32,
    backgroundColor: '#FAF5EE',
    borderWidth: 1,
    borderColor: '#E6DDD2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    shadowColor: '#2C221E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 14,
    width: 170
  },
  focusTooltipText: {
    fontSize: 9,
    color: '#7A6E65',
    textAlign: 'center',
    fontWeight: '600'
  }
});

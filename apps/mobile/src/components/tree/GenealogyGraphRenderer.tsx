import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
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
      {/* 1. Generational Tier Background Guides */}
      <Svg
        width={bounds.width}
        height={bounds.height}
        style={StyleSheet.absoluteFill}
      >
        {/* Tier horizontal lines */}
        {generationTiers.map(tier => (
          <G key={`tier-${tier.level}`}>
            <Line
              x1={0}
              y1={tier.y}
              x2={bounds.width}
              y2={tier.y}
              stroke="rgba(214, 203, 190, 0.45)"
              strokeDasharray="4,6"
              strokeWidth={1}
            />
            <SvgText
              x={20}
              y={tier.y - 12}
              fill="rgba(140, 122, 107, 0.75)"
              fontSize={10}
              fontWeight="bold"
              letterSpacing={1.1}
            >
              {tier.label.toUpperCase()}
            </SvgText>
          </G>
        ))}

        {/* 2. Structured Genealogy Connectors */}
        <G>
          {genealogyConnectors.map(conn => {
            const isMarriage = conn.type === 'marriage';
            const isSuggested = conn.isSuggested;
            return (
              <Path
                key={conn.id}
                d={conn.path}
                fill="none"
                stroke={isSuggested ? '#D97706' : isMarriage ? '#8D6E63' : '#B09A85'}
                strokeWidth={isMarriage ? 2.5 : 1.8}
                {...(isSuggested ? { strokeDasharray: '5,4' } : {})}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}
        </G>
      </Svg>

      {/* 3. Structured Person Cards */}
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
              isDeceased && styles.cardDeceased,
              isSelected && styles.cardSelected
            ]}
          >
            {/* Left: Avatar Thumbnail */}
            <View style={styles.avatarCol}>
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
                    isMale && styles.avatarMale,
                    isDeceased && styles.avatarDeceased
                  ]}
                >
                  <Text style={styles.initialText}>
                    {node.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}

              {/* Status Badge */}
              {node.isSelf ? (
                <View style={styles.selfBadge}>
                  <Text style={styles.selfBadgeText}>YOU</Text>
                </View>
              ) : isSuggested ? (
                <View style={styles.suggestedBadge}>
                  <Text style={styles.suggestedBadgeText}>AI?</Text>
                  <Text style={styles.suggestedBadgeText}>HINT</Text>
                </View>
              ) : null}
            </View>

            {/* Right: Info */}
            <View style={styles.infoCol}>
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

              <Text numberOfLines={1} style={styles.relTag}>
                {node.kinshipLabel || node.person.relationship || (node.isSelf ? 'Self' : 'Relative')}
              </Text>

              <Text numberOfLines={1} style={styles.metaRow}>
                {node.person.birthYear
                  ? `b. ${node.person.birthYear}`
                  : node.person.birthPlace || 'Heritage member'}
              </Text>
            </View>

            {/* Selection Marker */}
            {isSelected ? (
              <View style={styles.selectedMarker}>
                <Ionicons name="checkmark-circle" size={14} color={colors.terra} />
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFDF9',
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: '#E6DDD2',
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 8,
    shadowColor: '#3E2723',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 10
  },
  cardSelf: {
    borderColor: colors.terra,
    borderWidth: 2,
    backgroundColor: '#FFF8F4'
  },
  cardSuggested: {
    borderColor: '#D97706',
    borderStyle: 'dashed'
  },
  cardDeceased: {
    borderColor: '#A8A29E',
    backgroundColor: '#F5F5F4'
  },
  cardSelected: {
    borderColor: colors.terra,
    borderWidth: 2.5,
    transform: [{ scale: 1.04 }],
    shadowOpacity: 0.22,
    shadowRadius: 8
  },
  avatarCol: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarImg: {
    width: 44,
    height: 44,
    borderRadius: 22
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EFEBE4',
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarFemale: { backgroundColor: '#FADBD8' },
  avatarMale: { backgroundColor: '#D4E6F1' },
  avatarDeceased: { backgroundColor: '#E7E5E4', opacity: 0.8 },
  initialText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#4E342E'
  },
  selfBadge: {
    position: 'absolute',
    bottom: -4,
    backgroundColor: colors.terra,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6
  },
  selfBadgeText: {
    color: colors.white,
    fontSize: 7,
    fontWeight: '900'
  },
  suggestedBadge: {
    position: 'absolute',
    bottom: -4,
    backgroundColor: '#D97706',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 6
  },
  suggestedBadgeText: {
    color: colors.white,
    fontSize: 7,
    fontWeight: '900'
  },
  infoCol: {
    flex: 1,
    justifyContent: 'center',
    gap: 1
  },
  name: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.ink
  },
  nameSelected: {
    color: colors.terra,
    fontWeight: '900'
  },
  nameDeceased: {
    color: '#57534E'
  },
  relTag: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.terra
  },
  metaRow: {
    fontSize: 9,
    color: colors.muted,
    fontWeight: '500'
  },
  selectedMarker: {
    position: 'absolute',
    top: 4,
    right: 4
  }
});

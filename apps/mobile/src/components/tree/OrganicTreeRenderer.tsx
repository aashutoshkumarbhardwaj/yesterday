import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Stop
} from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';
import type { TreeLayoutResult, TreePersonNode } from './tree-types';

interface OrganicTreeRendererProps {
  layout: TreeLayoutResult;
  selectedNodeId: string | null;
  highlightedIds?: Set<string> | undefined;
  onSelectNode: (node: TreePersonNode) => void;
  onDoubleTapNode?: ((node: TreePersonNode) => void) | undefined;
}

export function OrganicTreeRenderer({
  layout,
  selectedNodeId,
  highlightedIds,
  onSelectNode
}: OrganicTreeRendererProps) {
  const { nodes, organicBranches, leafClusters, trunkPath, bounds } = layout;

  return (
    <View style={{ width: bounds.width, height: bounds.height }}>
      {/* 1. SVG Layer for Trunk, Organic Branches, and Leaves */}
      <Svg
        width={bounds.width}
        height={bounds.height}
        style={StyleSheet.absoluteFill}
      >
        <Defs>
          {/* Wood Bark Gradients */}
          <LinearGradient id="trunkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#3E2723" />
            <Stop offset="40%" stopColor="#4E342E" />
            <Stop offset="70%" stopColor="#5D4037" />
            <Stop offset="100%" stopColor="#2E1C14" />
          </LinearGradient>

          <LinearGradient id="branchGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#5D4037" />
            <Stop offset="100%" stopColor="#795548" />
          </LinearGradient>

          <LinearGradient id="leafGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#6B8E23" />
            <Stop offset="100%" stopColor="#386641" />
          </LinearGradient>

          <LinearGradient id="leafGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#8F9E78" />
            <Stop offset="100%" stopColor="#4A6B53" />
          </LinearGradient>

          <RadialGradient id="auraGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="rgba(192, 90, 62, 0.45)" />
            <Stop offset="100%" stopColor="rgba(192, 90, 62, 0)" />
          </RadialGradient>
        </Defs>

        {/* Central Organic Trunk Base */}
        {trunkPath ? (
          <Path
            d={trunkPath}
            fill="url(#trunkGrad)"
            opacity={0.88}
          />
        ) : null}

        {/* Organic Curved Branches */}
        <G>
          {organicBranches.map(branch => {
            const isDash = branch.isSuggested;
            return (
              <Path
                key={branch.id}
                d={branch.path}
                fill="none"
                stroke={branch.isSuggested ? '#D97706' : branch.strokeColor}
                strokeWidth={branch.strokeWidth}
                {...(isDash ? { strokeDasharray: '6,5' } : {})}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.92}
              />
            );
          })}
        </G>

        {/* Decorative Natural Leaves */}
        <G>
          {leafClusters.map(leaf => {
            // Elegant teardrop leaf shape
            return (
              <G
                key={leaf.id}
                transform={`translate(${leaf.x}, ${leaf.y}) rotate(${leaf.rotation}) scale(${leaf.scale})`}
              >
                <Path
                  d="M 0 0 C 8 -12, 16 -12, 22 0 C 16 12, 8 12, 0 0 Z"
                  fill={leaf.variant === 1 ? 'url(#leafGrad1)' : 'url(#leafGrad2)'}
                  opacity={0.88}
                />
                {/* Central leaf vein */}
                <Path
                  d="M 0 0 L 18 0"
                  stroke="#2E4F38"
                  strokeWidth={0.8}
                  opacity={0.7}
                />
              </G>
            );
          })}
        </G>
      </Svg>

      {/* 2. Interactive Person Medallion Nodes (Heritage Portrait Frames) */}
      {nodes.map(node => {
        const isSelected = selectedNodeId === node.id;
        const isHighlighted = highlightedIds?.has(node.id);
        const isSuggested = node.status === 'suggested';
        const isDeceased = node.isDeceased;
        const gender = node.person.gender;
        const isFemale = gender === 'female';
        const isMale = gender === 'male';

        return (
          <Pressable
            key={node.id}
            onPress={() => onSelectNode(node)}
            style={[
              styles.medallionWrapper,
              {
                left: node.x - node.radius,
                top: node.y - node.radius,
                width: node.radius * 2,
                height: node.radius * 2 + 50
              }
            ]}
          >
            {/* Selection Aura */}
            {isSelected ? (
              <View
                style={[
                  styles.selectedAura,
                  {
                    left: -12,
                    top: -12,
                    width: node.radius * 2 + 24,
                    height: node.radius * 2 + 24
                  }
                ]}
              />
            ) : null}

            {/* Heritage Portrait Frame */}
            <View
              style={[
                styles.frameCircle,
                { width: node.radius * 2, height: node.radius * 2 },
                node.isSelf && styles.frameSelf,
                isSuggested && styles.frameSuggested,
                isDeceased && styles.frameDeceased,
                isSelected && styles.frameSelected
              ]}
            >
              {node.avatarUri ? (
                <Image
                  source={{ uri: node.avatarUri }}
                  style={[
                    styles.portraitImage,
                    { width: node.radius * 2 - 8, height: node.radius * 2 - 8 },
                    isDeceased && styles.sepiaImage
                  ]}
                />
              ) : (
                <View
                  style={[
                    styles.initialsCircle,
                    { width: node.radius * 2 - 8, height: node.radius * 2 - 8 },
                    isFemale && styles.initialsFemale,
                    isMale && styles.initialsMale,
                    isDeceased && styles.initialsDeceased
                  ]}
                >
                  <Text
                    style={[
                      styles.initialsText,
                      isFemale && styles.textFemale,
                      isMale && styles.textMale,
                      isDeceased && styles.textDeceased
                    ]}
                  >
                    {node.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}

              {/* Status or Milestone Badges */}
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

              {/* Voice Story Indicator Pill */}
              {node.hasVoice ? (
                <View style={styles.voiceBadge}>
                  <Ionicons name="mic" size={10} color={colors.white} />
                </View>
              ) : null}
            </View>

            {/* Person Name & Life Dates below medallion */}
            <View style={styles.labelBox}>
              <Text
                numberOfLines={1}
                style={[
                  styles.nameText,
                  isSelected && styles.nameTextSelected,
                  isDeceased && styles.nameTextDeceased
                ]}
              >
                {node.name}
              </Text>
              <Text numberOfLines={1} style={styles.metaText}>
                {node.kinshipLabel || (node.person.birthYear ? `b. ${node.person.birthYear}` : node.person.relationship || '')}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  medallionWrapper: {
    position: 'absolute',
    alignItems: 'center',
    zIndex: 10
  },
  selectedAura: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(192, 90, 62, 0.22)',
    borderWidth: 2,
    borderColor: colors.terra,
    zIndex: -1
  },
  frameCircle: {
    borderRadius: 999,
    backgroundColor: '#FAF5EC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3.5,
    borderColor: '#B08968', // Antique warm wood / bronze
    shadowColor: '#3E2723',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4
  },
  frameSelf: {
    borderColor: colors.terra,
    borderWidth: 4
  },
  frameSuggested: {
    borderColor: '#D97706',
    borderStyle: 'dashed',
    borderWidth: 3
  },
  frameDeceased: {
    borderColor: '#78716C'
  },
  frameSelected: {
    borderColor: colors.terra,
    transform: [{ scale: 1.08 }]
  },
  portraitImage: {
    borderRadius: 999
  },
  sepiaImage: {
    opacity: 0.82
  },
  initialsCircle: {
    borderRadius: 999,
    backgroundColor: '#EFEBE4',
    alignItems: 'center',
    justifyContent: 'center'
  },
  initialsFemale: { backgroundColor: '#FADBD8' },
  initialsMale: { backgroundColor: '#D4E6F1' },
  initialsDeceased: { backgroundColor: '#E7E5E4' },
  initialsText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#4E342E'
  },
  textFemale: { color: '#922B21' },
  textMale: { color: '#1B4F72' },
  textDeceased: { color: '#57534E' },
  selfBadge: {
    position: 'absolute',
    bottom: -6,
    backgroundColor: colors.terra,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.white
  },
  selfBadgeText: {
    color: colors.white,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.6
  },
  suggestedBadge: {
    position: 'absolute',
    bottom: -6,
    backgroundColor: '#D97706',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.white
  },
  suggestedBadgeText: {
    color: colors.white,
    fontSize: 8,
    fontWeight: '900'
  },
  voiceBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.terra,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.white
  },
  labelBox: {
    alignItems: 'center',
    marginTop: 6,
    width: 110,
    backgroundColor: 'rgba(255, 253, 249, 0.88)',
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: 'rgba(229, 218, 203, 0.6)'
  },
  nameText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center'
  },
  nameTextSelected: {
    color: colors.terra,
    fontWeight: '900'
  },
  nameTextDeceased: {
    color: '#57534E'
  },
  metaText: {
    fontSize: 10,
    color: colors.muted,
    marginTop: 1,
    fontWeight: '600'
  }
});

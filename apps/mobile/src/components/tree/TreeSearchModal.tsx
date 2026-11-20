import React, { useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../../theme';
import type { TreePersonNode } from './tree-types';

interface TreeSearchModalProps {
  visible: boolean;
  nodes: TreePersonNode[];
  onClose: () => void;
  onSelectNode: (node: TreePersonNode) => void;
}

export function TreeSearchModal({
  visible,
  nodes,
  onClose,
  onSelectNode
}: TreeSearchModalProps) {
  const [query, setQuery] = useState('');

  const matches = useMemo(() => {
    if (!query.trim()) return nodes;
    const q = query.toLowerCase().trim();
    return nodes.filter(
      n =>
        n.name.toLowerCase().includes(q) ||
        (n.person.relationship ?? '').toLowerCase().includes(q) ||
        (n.person.birthPlace ?? '').toLowerCase().includes(q)
    );
  }, [nodes, query]);

  const handleSelect = (node: TreePersonNode) => {
    onSelectNode(node);
    onClose();
    setQuery('');
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Top Search Bar */}
        <View style={styles.topBar}>
          <Pressable onPress={onClose} style={styles.iconBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.ink} />
          </Pressable>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={17} color={colors.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search family member or ancestor..."
              placeholderTextColor={colors.muted}
              autoFocus
              style={styles.searchInput}
            />
            {query ? (
              <Pressable onPress={() => setQuery('')}>
                <Ionicons name="close-circle" size={18} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Results Count */}
        <Text style={styles.countText}>
          {matches.length} {matches.length === 1 ? 'Relative Found' : 'Relatives Found'}
        </Text>

        {/* Results List */}
        <ScrollView contentContainerStyle={styles.listContent}>
          {matches.map(node => {
            const isFemale = node.person.gender === 'female';
            const isMale = node.person.gender === 'male';

            return (
              <Pressable
                key={node.id}
                onPress={() => handleSelect(node)}
                style={styles.resultRow}
              >
                {node.avatarUri ? (
                  <Image source={{ uri: node.avatarUri }} style={styles.avatarImg} />
                ) : (
                  <View
                    style={[
                      styles.avatarPlaceholder,
                      isFemale && styles.avatarFemale,
                      isMale && styles.avatarMale
                    ]}
                  >
                    <Text style={styles.initialText}>{node.name.charAt(0).toUpperCase()}</Text>
                  </View>
                )}

                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.personName}>{node.name}</Text>
                  <Text style={styles.personRelation}>
                    {node.person.relationship || (node.isSelf ? 'Self' : 'Family Member')}
                  </Text>
                  {node.person.birthYear || node.person.birthPlace ? (
                    <Text style={styles.personMeta}>
                      {node.person.birthYear ? `b. ${node.person.birthYear}` : ''}
                      {node.person.birthPlace ? ` · ${node.person.birthPlace}` : ''}
                    </Text>
                  ) : null}
                </View>

                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 44 : 54,
    paddingBottom: 12,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  iconBtn: {
    padding: 4
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surfaceWarm,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.ink,
    padding: 0
  },
  countText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.muted,
    letterSpacing: 1.1,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: 8
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border
  },
  avatarImg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: colors.terra
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarFemale: { backgroundColor: '#FADBD8' },
  avatarMale: { backgroundColor: '#D4E6F1' },
  initialText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#4E342E'
  },
  personName: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.ink
  },
  personRelation: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.terra
  },
  personMeta: {
    fontSize: 11,
    color: colors.muted
  }
});


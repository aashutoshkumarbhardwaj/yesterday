import React, { useState } from 'react';
import {
  Alert,
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
import { upsertTreeEntities } from '../../lib/database';
import type { TreePersonNode } from './tree-types';

interface AddRelativeModalProps {
  visible: boolean;
  targetNode: TreePersonNode | null;
  onClose: () => void;
  onRelativeAdded: () => void;
}

export function AddRelativeModal({
  visible,
  targetNode,
  onClose,
  onRelativeAdded
}: AddRelativeModalProps) {
  if (!targetNode) return null;

  const [name, setName] = useState('');
  const [relationType, setRelationType] = useState<'parent' | 'spouse' | 'child' | 'sibling'>('child');
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('male');
  const [birthYear, setBirthYear] = useState('');
  const [birthPlace, setBirthPlace] = useState('');
  const [saving, setSaving] = useState(false);

  const relationOptions = [
    { key: 'child', label: 'Child of ' + targetNode.name },
    { key: 'parent', label: 'Parent of ' + targetNode.name },
    { key: 'spouse', label: 'Spouse / Partner of ' + targetNode.name },
    { key: 'sibling', label: 'Sibling of ' + targetNode.name }
  ];

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Name Required', 'Please enter a name for the new family member.');
      return;
    }

    setSaving(true);
    try {
      const birthYearNum = birthYear.trim() ? parseInt(birthYear.trim(), 10) : null;

      // Map relationship direction
      let personA = targetNode.name;
      let personB = name.trim();
      let edgeType = relationType;

      if (relationType === 'parent') {
        personA = name.trim();
        personB = targetNode.name;
        edgeType = 'parent';
      }

      await upsertTreeEntities(
        [
          {
            name: name.trim(),
            gender,
            birthYear: birthYearNum,
            birthPlace: birthPlace.trim() || null,
            relationshipToNarrator: relationType
          }
        ],
        [
          {
            personA,
            personB,
            type: edgeType,
            evidence: 'Added via Family Tree'
          }
        ]
      );

      setName('');
      setBirthYear('');
      setBirthPlace('');
      onRelativeAdded();
      onClose();
      Alert.alert('Relative Added', `${name.trim()} added to your family tree.`);
    } catch (err) {
      Alert.alert('Error', 'Could not save relative.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.topBar}>
          <Pressable onPress={onClose} style={styles.iconBtn}>
            <Ionicons name="close" size={24} color={colors.ink} />
          </Pressable>
          <Text style={styles.topBarTitle}>Add Relative</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Target Person Info */}
          <View style={styles.targetCard}>
            <Text style={styles.targetLabel}>CONNECTING TO</Text>
            <Text style={styles.targetName}>{targetNode.name}</Text>
          </View>

          {/* Relation Type Picker */}
          <Text style={styles.inputLabel}>RELATIONSHIP TYPE</Text>
          <View style={styles.optionWrap}>
            {relationOptions.map(opt => (
              <Pressable
                key={opt.key}
                onPress={() => setRelationType(opt.key as any)}
                style={[styles.relOption, relationType === opt.key && styles.relOptionActive]}
              >
                <Text style={[styles.relOptionText, relationType === opt.key && styles.relOptionTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Name Input */}
          <Text style={styles.inputLabel}>FULL NAME *</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Meera Sharma"
            style={styles.textInput}
          />

          {/* Gender */}
          <Text style={styles.inputLabel}>GENDER</Text>
          <View style={styles.genderRow}>
            {(['male', 'female', 'other'] as const).map(g => (
              <Pressable
                key={g}
                onPress={() => setGender(g)}
                style={[styles.genderChip, gender === g && styles.genderChipActive]}
              >
                <Text style={[styles.genderChipText, gender === g && styles.genderChipTextActive]}>
                  {g.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Birth Year */}
          <Text style={styles.inputLabel}>BIRTH YEAR</Text>
          <TextInput
            value={birthYear}
            onChangeText={setBirthYear}
            placeholder="e.g. 1974"
            keyboardType="numeric"
            style={styles.textInput}
          />

          {/* Birth Place */}
          <Text style={styles.inputLabel}>BIRTH PLACE / HOMETOWN</Text>
          <TextInput
            value={birthPlace}
            onChangeText={setBirthPlace}
            placeholder="e.g. Jaipur, Rajasthan"
            style={styles.textInput}
          />

          <Pressable onPress={handleSave} disabled={saving} style={styles.saveBtn}>
            <Text style={styles.saveBtnText}>
              {saving ? 'Saving...' : 'Add to Family Tree'}
            </Text>
          </Pressable>
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 44 : 54,
    paddingBottom: 12,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  iconBtn: { padding: 4 },
  topBarTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  scroll: {
    padding: 16,
    gap: 12,
    paddingBottom: 40
  },
  targetCard: {
    backgroundColor: colors.surfaceWarm,
    borderRadius: radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border
  },
  targetLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.muted,
    letterSpacing: 1.1
  },
  targetName: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
    marginTop: 2
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.muted,
    letterSpacing: 1.1,
    marginTop: 4
  },
  optionWrap: {
    gap: 6
  },
  relOption: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: colors.border
  },
  relOptionActive: {
    borderColor: colors.terra,
    backgroundColor: '#FFF8F4'
  },
  relOptionText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink
  },
  relOptionTextActive: {
    color: colors.terra,
    fontWeight: '800'
  },
  textInput: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.ink,
    borderWidth: 1,
    borderColor: colors.border
  },
  genderRow: {
    flexDirection: 'row',
    gap: 8
  },
  genderChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border
  },
  genderChipActive: {
    backgroundColor: colors.terra,
    borderColor: colors.terra
  },
  genderChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.ink
  },
  genderChipTextActive: {
    color: colors.white
  },
  saveBtn: {
    backgroundColor: colors.terra,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12
  },
  saveBtnText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800'
  }
});


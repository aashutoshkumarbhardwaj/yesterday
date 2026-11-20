import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../src/theme';
import { exportGedcom, importGedcom, previewGedcom } from '../src/lib/api';
import { listPeople, upsertTreeEntities } from '../src/lib/database';

export default function GedcomScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'import' | 'export'>('import');

  // Import State
  const [gedcomInput, setGedcomInput] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<{
    totalIndividuals: number;
    totalFamilies: number;
    samplePeople: Array<{ id: string; name: string; birthYear?: number; gender?: string }>;
    duplicateCandidates: Array<{ importedName: string; existingName: string; confidence: number; matchReason: string }>;
  } | null>(null);

  // Export State
  const [exportLoading, setExportLoading] = useState(false);
  const [exportedGedcom, setExportedGedcom] = useState('');

  const handlePreview = async () => {
    if (!gedcomInput.trim()) {
      Alert.alert('Empty GEDCOM', 'Please paste GEDCOM text or load sample data.');
      return;
    }
    setPreviewLoading(true);
    try {
      const res = await previewGedcom(gedcomInput, 'default-family');
      setPreviewResult(res.preview);
    } catch (err: any) {
      Alert.alert('Preview Failed', err.message || 'Could not parse GEDCOM text.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleLoadSample = () => {
    const sample = `0 HEAD
1 SOUR YESTERDAY_GENEALOGY
1 GEDC
2 VERS 5.5.1
2 FORM LINEAGE-LINKED
0 @I1@ INDI
1 NAME Rajesh /Sharma/
1 SEX M
1 BIRT
2 DATE 12 MAY 1948
2 PLAC Delhi, India
1 FAMS @F1@
0 @I2@ INDI
1 NAME Sunita /Sharma/
1 SEX F
1 BIRT
2 DATE 05 AUG 1952
2 PLAC Lucknow, India
1 FAMS @F1@
0 @I3@ INDI
1 NAME Vikram /Sharma/
1 SEX M
1 BIRT
2 DATE 20 NOV 1978
2 PLAC Mumbai, India
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
0 TRLR`;
    setGedcomInput(sample);
  };

  const handleImport = async () => {
    if (!gedcomInput.trim()) return;
    setImportLoading(true);
    try {
      const res = await importGedcom(gedcomInput, 'default-family');
      // Also sync to local database so interactive Skia tree reflects it immediately
      if (previewResult) {
        await upsertTreeEntities(
          previewResult.samplePeople.map(p => ({
            name: p.name,
            gender: (p.gender === 'M' ? 'male' : p.gender === 'F' ? 'female' : 'other') as 'male' | 'female' | 'other',
            birthYear: p.birthYear ?? null
          })),
          []
        );
      }

      Alert.alert(
        'Import Succeeded',
        `Imported ${res.importedPeopleCount} individuals and ${res.importedFamiliesCount} family units.`
      );
      setPreviewResult(null);
      setGedcomInput('');
    } catch (err: any) {
      Alert.alert('Import Failed', err.message || 'Could not complete GEDCOM import.');
    } finally {
      setImportLoading(false);
    }
  };

  const handleExport = async () => {
    setExportLoading(true);
    try {
      const ged = await exportGedcom('default-family');
      setExportedGedcom(ged);
    } catch (err: any) {
      // Local fallback export if offline
      const localPeople = await listPeople();
      let fallback = `0 HEAD\n1 SOUR YESTERDAY_OFFLINE\n1 GEDC\n2 VERS 5.5.1\n`;
      localPeople.forEach((p, idx) => {
        fallback += `0 @I${idx + 1}@ INDI\n1 NAME ${p.name}\n`;
        if (p.gender) fallback += `1 SEX ${p.gender === 'male' ? 'M' : p.gender === 'female' ? 'F' : 'U'}\n`;
        if (p.birthYear) fallback += `1 BIRT\n2 DATE ${p.birthYear}\n`;
      });
      fallback += `0 TRLR\n`;
      setExportedGedcom(fallback);
    } finally {
      setExportLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    Clipboard.setString(text);
    Alert.alert('Copied', 'GEDCOM data copied to clipboard.');
  };

  return (
    <View style={styles.container}>
      {/* Top Navbar */}
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.topBarTitle}>GEDCOM 5.5.1 Genealogy</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        <Pressable
          onPress={() => setActiveTab('import')}
          style={[styles.tabBtn, activeTab === 'import' && styles.tabBtnActive]}
        >
          <Ionicons name="download-outline" size={16} color={activeTab === 'import' ? colors.terra : colors.muted} />
          <Text style={[styles.tabText, activeTab === 'import' && styles.tabTextActive]}>Import Family Tree</Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab('export')}
          style={[styles.tabBtn, activeTab === 'export' && styles.tabBtnActive]}
        >
          <Ionicons name="share-outline" size={16} color={activeTab === 'export' ? colors.terra : colors.muted} />
          <Text style={[styles.tabText, activeTab === 'export' && styles.tabTextActive]}>Export GEDCOM</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {activeTab === 'import' ? (
          <View style={{ gap: 14 }}>
            <View style={styles.infoBox}>
              <Ionicons name="information-circle" size={18} color={colors.terra} />
              <Text style={styles.infoText}>
                Import standard GEDCOM files from Ancestry, MyHeritage, FamilySearch, or Gramps. Yesterday inspects duplicates and asks for confirmation.
              </Text>
            </View>

            <View style={styles.actionRow}>
              <Text style={styles.inputLabel}>GEDCOM FILE CONTENT (5.5.1)</Text>
              <Pressable onPress={handleLoadSample} style={styles.sampleBtn}>
                <Text style={styles.sampleBtnText}>Load Sample</Text>
              </Pressable>
            </View>

            <TextInput
              value={gedcomInput}
              onChangeText={setGedcomInput}
              placeholder="Paste raw .GED file text here (starts with 0 HEAD)..."
              multiline
              style={styles.textArea}
            />

            <Pressable
              onPress={handlePreview}
              disabled={previewLoading}
              style={styles.previewBtn}
            >
              {previewLoading ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <Ionicons name="search" size={16} color={colors.white} />
                  <Text style={styles.previewBtnText}>Preview & Inspect Duplicates</Text>
                </>
              )}
            </Pressable>

            {previewResult ? (
              <View style={styles.previewCard}>
                <Text style={styles.previewHeader}>PREVIEW SUMMARY</Text>
                <View style={styles.statsRow}>
                  <View style={styles.statBox}>
                    <Text style={styles.statVal}>{previewResult.totalIndividuals}</Text>
                    <Text style={styles.statLabel}>Individuals</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statVal}>{previewResult.totalFamilies}</Text>
                    <Text style={styles.statLabel}>Families</Text>
                  </View>
                </View>

                {previewResult.duplicateCandidates.length > 0 ? (
                  <View style={styles.dupWarningCard}>
                    <Ionicons name="alert-circle" size={16} color="#D97706" />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.dupWarningTitle}>Potential Duplicate Candidates Found</Text>
                      {previewResult.duplicateCandidates.map((dup, i) => (
                        <Text key={i} style={styles.dupWarningDesc}>
                          • "{dup.importedName}" matches existing "{dup.existingName}" ({Math.round(dup.confidence * 100)}% match)
                        </Text>
                      ))}
                    </View>
                  </View>
                ) : null}

                <Text style={styles.sampleHeader}>SAMPLE PEOPLE DETECTED</Text>
                {previewResult.samplePeople.map(p => (
                  <View key={p.id} style={styles.samplePersonRow}>
                    <Text style={styles.samplePersonName}>{p.name}</Text>
                    <Text style={styles.samplePersonMeta}>
                      {p.gender ? (p.gender === 'M' ? 'Male' : 'Female') : 'Gender U'} {p.birthYear ? `• b. ${p.birthYear}` : ''}
                    </Text>
                  </View>
                ))}

                <Pressable
                  onPress={handleImport}
                  disabled={importLoading}
                  style={styles.confirmImportBtn}
                >
                  {importLoading ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <>
                      <Ionicons name="checkmark-done" size={18} color={colors.white} />
                      <Text style={styles.confirmImportBtnText}>Confirm & Merge into Family Graph</Text>
                    </>
                  )}
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={{ gap: 16 }}>
            <View style={styles.infoBox}>
              <Ionicons name="share-social" size={18} color={colors.terra} />
              <Text style={styles.infoText}>
                Export your family history into an open, archival-grade GEDCOM 5.5.1 format. You own your data forever and can import it into any genealogy software.
              </Text>
            </View>

            <Pressable
              onPress={handleExport}
              disabled={exportLoading}
              style={styles.previewBtn}
            >
              {exportLoading ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <Ionicons name="cloud-download-outline" size={18} color={colors.white} />
                  <Text style={styles.previewBtnText}>Generate GEDCOM 5.5.1 File</Text>
                </>
              )}
            </Pressable>

            {exportedGedcom ? (
              <View style={styles.exportCard}>
                <View style={styles.exportHeader}>
                  <Text style={styles.exportTitle}>yesterday-family-tree.ged</Text>
                  <Pressable onPress={() => copyToClipboard(exportedGedcom)} style={styles.copyBtn}>
                    <Ionicons name="copy-outline" size={14} color={colors.terra} />
                    <Text style={styles.copyBtnText}>Copy Text</Text>
                  </Pressable>
                </View>
                <TextInput
                  value={exportedGedcom}
                  multiline
                  editable={false}
                  style={styles.exportTextArea}
                />
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
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
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent'
  },
  tabBtnActive: { borderBottomColor: colors.terra },
  tabText: { fontSize: 13, fontWeight: '700', color: colors.muted },
  tabTextActive: { color: colors.terra },
  scrollContent: { padding: 16, paddingBottom: 40 },
  infoBox: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: colors.surfaceWarm,
    borderRadius: radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border
  },
  infoText: { flex: 1, fontSize: 12, color: colors.ink, lineHeight: 18 },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  inputLabel: { fontSize: 10, fontWeight: '800', color: colors.muted, letterSpacing: 1.1 },
  sampleBtn: {
    backgroundColor: colors.surfaceWarm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4
  },
  sampleBtnText: { fontSize: 11, fontWeight: '700', color: colors.terra },
  textArea: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 12,
    height: 180,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: colors.ink,
    borderWidth: 1,
    borderColor: colors.border
  },
  previewBtn: {
    backgroundColor: colors.terra,
    borderRadius: radius.md,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  previewBtnText: { color: colors.white, fontSize: 13, fontWeight: '800' },
  previewCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border
  },
  previewHeader: { fontSize: 11, fontWeight: '800', color: colors.muted, letterSpacing: 1.1 },
  statsRow: { flexDirection: 'row', gap: 12 },
  statBox: {
    flex: 1,
    backgroundColor: colors.surfaceWarm,
    borderRadius: radius.md,
    padding: 12,
    alignItems: 'center'
  },
  statVal: { fontSize: 20, fontWeight: '900', color: colors.ink },
  statLabel: { fontSize: 11, color: colors.muted, marginTop: 2 },
  dupWarningCard: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#FEF3C7',
    padding: 10,
    borderRadius: 6
  },
  dupWarningTitle: { fontSize: 12, fontWeight: '800', color: '#92400E' },
  dupWarningDesc: { fontSize: 11, color: '#B45309', marginTop: 2 },
  sampleHeader: { fontSize: 10, fontWeight: '800', color: colors.muted, letterSpacing: 1.1, marginTop: 4 },
  samplePersonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceWarm
  },
  samplePersonName: { fontSize: 13, fontWeight: '700', color: colors.ink },
  samplePersonMeta: { fontSize: 11, color: colors.muted },
  confirmImportBtn: {
    backgroundColor: '#1B5E20',
    borderRadius: radius.md,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 6
  },
  confirmImportBtnText: { color: colors.white, fontSize: 13, fontWeight: '800' },
  exportCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border
  },
  exportHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  exportTitle: { fontSize: 13, fontWeight: '800', color: colors.ink },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceWarm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4
  },
  copyBtnText: { fontSize: 11, fontWeight: '700', color: colors.terra },
  exportTextArea: {
    backgroundColor: colors.surfaceWarm,
    borderRadius: radius.md,
    padding: 10,
    height: 220,
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: colors.ink
  }
});
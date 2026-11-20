import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors, radius } from '../src/theme';
import { processDocumentOCR, type ProcessedDocumentResult } from '../src/lib/api';
import { addLocalSuggestion, upsertTreeEntities } from '../src/lib/database';

export default function DocumentsScreen() {
  const router = useRouter();
  const [selectedUri, setSelectedUri] = useState<string | null>(null);
  const [docType, setDocType] = useState('certificate');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<ProcessedDocumentResult | null>(null);

  const docTypes = [
    { key: 'certificate', label: 'Certificate' },
    { key: 'letter', label: 'Letter / Diary' },
    { key: 'recipe', label: 'Family Recipe' },
    { key: 'photograph', label: 'Historic Photo' },
    { key: 'deed', label: 'Land Deed' },
    { key: 'general', label: 'General' }
  ];

  const pickImage = async (useCamera = false) => {
    try {
      let res;
      if (useCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Camera Access', 'Please allow camera access to scan documents.');
          return;
        }
        res = await ImagePicker.launchCameraAsync({
          quality: 0.85
        });
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Gallery Access', 'Please allow photo gallery access to select documents.');
          return;
        }
        res = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.85
        });
      }

      if (!res.canceled && res.assets && res.assets[0]) {
        setSelectedUri(res.assets[0].uri);
        setResult(null);
      }
    } catch (err) {
      Alert.alert('Error', 'Could not open image.');
    }
  };

  const handleAnalyze = async () => {
    if (!selectedUri) {
      Alert.alert('Select Document', 'Please choose a document or photograph to analyze.');
      return;
    }
    setAnalyzing(true);
    try {
      const data = await processDocumentOCR(selectedUri, docType, 'default-family');
      setResult(data);
    } catch (err: any) {
      Alert.alert('OCR Analysis Error', err.message || 'Could not process document. Make sure the API server is connected.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSaveFactsToTree = async () => {
    if (!result) return;
    try {
      // 1. Save suggested facts to local review queue
      for (const fact of result.suggestedFacts) {
        await addLocalSuggestion({
          factType: fact.factType,
          confidence: fact.confidence,
          value: fact.details,
          evidenceExcerpt: `Document OCR (${result.documentType}): ${fact.excerpt}`
        });
      }

      // 2. If relationships were inferred, register them directly as candidates
      if (result.relationshipsInferred && result.relationshipsInferred.length > 0) {
        await upsertTreeEntities(
          result.peopleMentioned.map(name => ({ name })),
          result.relationshipsInferred.map(r => ({
            personA: r.personA,
            personB: r.personB,
            type: r.relation,
            evidence: `Found in ${result.documentType}`
          }))
        );
      }

      Alert.alert(
        'Facts Recorded',
        `Successfully added ${result.suggestedFacts.length} fact suggestions to your verification queue.`
      );
      router.push('/review-suggestions');
    } catch (err) {
      Alert.alert('Error', 'Could not save facts to tree.');
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Navbar */}
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.topBarTitle}>Document & Photograph OCR</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Intro Banner */}
        <View style={styles.banner}>
          <Ionicons name="document-text" size={18} color={colors.terra} />
          <Text style={styles.bannerText}>
            Preserve birth certificates, handwritten family recipes, migration papers, letters, and historical family photographs.
          </Text>
        </View>

        {/* Document Type Selector */}
        <Text style={styles.inputLabel}>DOCUMENT TYPE</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeScroll}>
          {docTypes.map(t => (
            <Pressable
              key={t.key}
              onPress={() => setDocType(t.key)}
              style={[styles.typeChip, docType === t.key && styles.typeChipActive]}
            >
              <Text style={[styles.typeChipText, docType === t.key && styles.typeChipTextActive]}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Image Preview & Picker Actions */}
        <View style={styles.previewBox}>
          {selectedUri ? (
            <Image source={{ uri: selectedUri }} style={styles.docImage} resizeMode="cover" />
          ) : (
            <View style={styles.placeholderBox}>
              <Ionicons name="scan-outline" size={44} color={colors.muted} />
              <Text style={styles.placeholderTitle}>Scan or Upload Document</Text>
              <Text style={styles.placeholderDesc}>
                Certificates, handwritten letters, old family recipes, or antique portraits.
              </Text>
            </View>
          )}

          <View style={styles.pickerBtnRow}>
            <Pressable onPress={() => pickImage(true)} style={styles.pickerBtn}>
              <Ionicons name="camera" size={16} color={colors.terra} />
              <Text style={styles.pickerBtnText}>Use Camera</Text>
            </Pressable>
            <Pressable onPress={() => pickImage(false)} style={styles.pickerBtn}>
              <Ionicons name="images" size={16} color={colors.terra} />
              <Text style={styles.pickerBtnText}>From Gallery</Text>
            </Pressable>
          </View>
        </View>

        {selectedUri ? (
          <Pressable
            onPress={handleAnalyze}
            disabled={analyzing}
            style={styles.analyzeBtn}
          >
            {analyzing ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <>
                <Ionicons name="sparkles" size={18} color={colors.white} />
                <Text style={styles.analyzeBtnText}>Analyze Document with AI OCR</Text>
              </>
            )}
          </Pressable>
        ) : null}

        {/* OCR Results */}
        {result ? (
          <View style={styles.resultsCard}>
            <View style={styles.resultsHeader}>
              <Text style={styles.resultsTitle}>EXTRACTED KNOWLEDGE</Text>
              <View style={styles.docTypeBadge}>
                <Text style={styles.docTypeBadgeText}>{(result.documentType || 'DOCUMENT').toUpperCase()}</Text>
              </View>
            </View>

            {/* Extracted Text */}
            <Text style={styles.subHeader}>EXTRACTED TEXT</Text>
            <View style={styles.textBox}>
              <Text style={styles.extractedContentText}>{result.extractedText}</Text>
            </View>

            {/* Entities Found */}
            <View style={styles.entitySection}>
              {result.peopleMentioned.length > 0 ? (
                <View style={styles.entityRow}>
                  <Text style={styles.entityLabel}>People:</Text>
                  <Text style={styles.entityValue}>{result.peopleMentioned.join(', ')}</Text>
                </View>
              ) : null}

              {result.datesMentioned.length > 0 ? (
                <View style={styles.entityRow}>
                  <Text style={styles.entityLabel}>Dates:</Text>
                  <Text style={styles.entityValue}>{result.datesMentioned.join(', ')}</Text>
                </View>
              ) : null}

              {result.placesMentioned.length > 0 ? (
                <View style={styles.entityRow}>
                  <Text style={styles.entityLabel}>Places:</Text>
                  <Text style={styles.entityValue}>{result.placesMentioned.join(', ')}</Text>
                </View>
              ) : null}
            </View>

            {/* Suggested Facts */}
            {result.suggestedFacts.length > 0 ? (
              <View style={{ gap: 8 }}>
                <Text style={styles.subHeader}>FACT SUGGESTIONS GENERATED ({result.suggestedFacts.length})</Text>
                {result.suggestedFacts.map((fact, idx) => (
                  <View key={idx} style={styles.factCard}>
                    <View style={styles.factCardTop}>
                      <Text style={styles.factType}>{fact.factType.replace(/_/g, ' ').toUpperCase()}</Text>
                      <Text style={styles.factConf}>{Math.round(fact.confidence * 100)}% Confidence</Text>
                    </View>
                    <Text style={styles.factExcerpt}>"{fact.excerpt}"</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Confirm to Tree */}
            <Pressable onPress={handleSaveFactsToTree} style={styles.saveFactsBtn}>
              <Ionicons name="checkmark-circle" size={18} color={colors.white} />
              <Text style={styles.saveFactsBtnText}>Send to Fact Verification Queue</Text>
            </Pressable>
          </View>
        ) : null}
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
  scrollContent: { padding: 16, paddingBottom: 40, gap: 12 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surfaceWarm,
    borderRadius: radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border
  },
  bannerText: { flex: 1, fontSize: 11, color: colors.terra, fontWeight: '600', lineHeight: 16 },
  inputLabel: { fontSize: 10, fontWeight: '800', color: colors.muted, letterSpacing: 1.1 },
  typeScroll: { gap: 6, paddingVertical: 4 },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border
  },
  typeChipActive: { backgroundColor: colors.terra, borderColor: colors.terra },
  typeChipText: { fontSize: 11, fontWeight: '700', color: colors.ink },
  typeChipTextActive: { color: colors.white },
  previewBox: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border
  },
  docImage: { width: '100%', height: 240 },
  placeholderBox: {
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8
  },
  placeholderTitle: { fontSize: 14, fontWeight: '800', color: colors.ink },
  placeholderDesc: { fontSize: 12, color: colors.muted, textAlign: 'center', lineHeight: 18 },
  pickerBtnRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceWarm
  },
  pickerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12
  },
  pickerBtnText: { fontSize: 12, fontWeight: '700', color: colors.terra },
  analyzeBtn: {
    backgroundColor: colors.terra,
    borderRadius: radius.md,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  analyzeBtnText: { color: colors.white, fontSize: 13, fontWeight: '800' },
  resultsCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12
  },
  resultsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resultsTitle: { fontSize: 11, fontWeight: '800', color: colors.muted, letterSpacing: 1.1 },
  docTypeBadge: {
    backgroundColor: colors.surfaceWarm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4
  },
  docTypeBadgeText: { fontSize: 10, fontWeight: '800', color: colors.terra },
  subHeader: { fontSize: 10, fontWeight: '800', color: colors.muted, letterSpacing: 1.1 },
  textBox: {
    backgroundColor: colors.surfaceWarm,
    borderRadius: radius.md,
    padding: 12
  },
  extractedContentText: { fontSize: 12, color: colors.ink, lineHeight: 18 },
  entitySection: {
    backgroundColor: colors.surfaceWarm,
    borderRadius: radius.md,
    padding: 12,
    gap: 6
  },
  entityRow: { flexDirection: 'row', gap: 6 },
  entityLabel: { fontSize: 11, fontWeight: '800', color: colors.muted, width: 60 },
  entityValue: { flex: 1, fontSize: 11, color: colors.ink, fontWeight: '600' },
  factCard: {
    backgroundColor: colors.surfaceWarm,
    borderRadius: radius.md,
    padding: 10,
    gap: 4
  },
  factCardTop: { flexDirection: 'row', justifyContent: 'space-between' },
  factType: { fontSize: 10, fontWeight: '800', color: colors.terra },
  factConf: { fontSize: 10, fontWeight: '800', color: '#1B5E20' },
  factExcerpt: { fontSize: 11, color: colors.ink, fontStyle: 'italic' },
  saveFactsBtn: {
    backgroundColor: '#1B5E20',
    borderRadius: radius.md,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4
  },
  saveFactsBtnText: { color: colors.white, fontSize: 13, fontWeight: '800' }
});
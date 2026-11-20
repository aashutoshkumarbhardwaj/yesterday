import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../../theme';
import { createShareTokenClient, getPrintableTreeUrl, getServerUrl } from '../../lib/sync-client';

interface ExportTreeModalProps {
  visible: boolean;
  onClose: () => void;
  familyId?: string;
}

export function ExportTreeModal({ visible, onClose, familyId }: ExportTreeModalProps) {
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const handlePrintableHtml = async () => {
    const url = getPrintableTreeUrl(familyId);
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Open Browser', `Please visit this URL in your browser:\n${url}`);
    }
  };

  const handleGenerateShareLink = async () => {
    try {
      setSharing(true);
      const res = await createShareTokenClient({
        entityType: 'tree',
        title: 'Our Family Tree Heritage',
        expiresInDays: 30
      });
      const url = `${getServerUrl()}/v1/share/${res.token}`;
      setShareUrl(url);

      await Share.share({
        title: 'Our Family Heritage Tree',
        message: `Explore our family heritage tree on Yesterday: ${url}`,
        url
      });
    } catch (err: any) {
      Alert.alert('Share Error', err.message || 'Could not generate share link.');
    } finally {
      setSharing(false);
    }
  };

  const handleExportGedcom = async () => {
    const targetFamily = familyId || 'default-family';
    const gedcomUrl = `${getServerUrl()}/v1/genealogy/gedcom/export?familyId=${encodeURIComponent(targetFamily)}`;
    try {
      await Linking.openURL(gedcomUrl);
    } catch {
      Alert.alert('Export GEDCOM', `Download your GEDCOM 5.5.1 archive from:\n${gedcomUrl}`);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={styles.iconCircle}>
                <Ionicons name="share-social" size={20} color={colors.terra} />
              </View>
              <View>
                <Text style={styles.title}>Export & Share Tree</Text>
                <Text style={styles.subtitle}>Preserve, print, or share your ancestry</Text>
              </View>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={colors.ink} />
            </Pressable>
          </View>

          {/* Options */}
          <View style={styles.content}>
            {/* 1. Printable Poster */}
            <Pressable onPress={handlePrintableHtml} style={styles.optionCard}>
              <View style={[styles.cardIcon, { backgroundColor: '#F2E7D9' }]}>
                <Ionicons name="print-outline" size={22} color={colors.terra} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.optionTitle}>Printable Tree View / PDF</Text>
                <Text style={styles.optionDesc}>
                  Generates an elegant, high-resolution parchment poster view designed for printing, framing, or saving as PDF.
                </Text>
              </View>
              <Ionicons name="open-outline" size={18} color={colors.muted} />
            </Pressable>

            {/* 2. Shareable Web Link */}
            <Pressable
              onPress={handleGenerateShareLink}
              disabled={sharing}
              style={styles.optionCard}
            >
              <View style={[styles.cardIcon, { backgroundColor: '#EBF2FF' }]}>
                {sharing ? (
                  <ActivityIndicator size="small" color="#3A86FF" />
                ) : (
                  <Ionicons name="link-outline" size={22} color="#3A86FF" />
                )}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.optionTitle}>Generate Secure Share Link</Text>
                <Text style={styles.optionDesc}>
                  Create a read-only tokenized link to share with relatives on WhatsApp or SMS without requiring an account.
                </Text>
                {shareUrl ? (
                  <Text style={styles.activeSharePill} numberOfLines={1}>
                    Active: {shareUrl}
                  </Text>
                ) : null}
              </View>
              <Ionicons name="share-outline" size={18} color={colors.muted} />
            </Pressable>

            {/* 3. Export GEDCOM */}
            <Pressable onPress={handleExportGedcom} style={styles.optionCard}>
              <View style={[styles.cardIcon, { backgroundColor: '#EBF9EB' }]}>
                <Ionicons name="download-outline" size={22} color="#38B000" />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.optionTitle}>Export GEDCOM 5.5.1</Text>
                <Text style={styles.optionDesc}>
                  Standard genealogy format compatible with Ancestry, MyHeritage, FamilySearch, and Gramps.
                </Text>
              </View>
              <Ionicons name="cloud-download-outline" size={18} color={colors.muted} />
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 20
  },
  container: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 20,
    gap: 16,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center'
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.ink
  },
  subtitle: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 1
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center'
  },
  content: {
    gap: 12
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border
  },
  cardIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink
  },
  optionDesc: {
    fontSize: 11,
    color: colors.muted,
    lineHeight: 15
  },
  activeSharePill: {
    fontSize: 10,
    color: colors.terra,
    marginTop: 4,
    fontWeight: '600'
  }
});


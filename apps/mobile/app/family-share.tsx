import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../src/components/Screen';
import { colors, radius } from '../src/theme';
import {
  approveMember,
  createCloudFamily,
  createInvitationClient,
  fetchFamilyActivity,
  fetchFamilyDetails,
  getCachedSession,
  getServerUrl,
  initSyncSession,
  joinCloudFamily,
  leaveFamily,
  listInvitationsClient,
  listUserFamiliesClient,
  removeMember,
  resendInvitationClient,
  revokeInvitationClient,
  setServerUrl,
  syncWithCloud,
  testServerConnection,
  updateFamilySettingsClient,
  type ClientActivityItem,
  type ClientInvitation,
  type FamilyMember,
  type SharedFamilyTree,
  type StoredFamilySession
} from '../src/lib/sync-client';
import { listPeople } from '../src/lib/database';

type HubTab = 'overview' | 'members' | 'invitations' | 'activity';

export default function FamilyShareScreen() {
  const [activeTab, setActiveTab] = useState<HubTab>('overview');
  const [session, setSession] = useState<StoredFamilySession | null>(null);
  const [familyDetails, setFamilyDetails] = useState<SharedFamilyTree | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Form states for creating family
  const [createFamilyName, setCreateFamilyName] = useState('');
  const [createUserName, setCreateUserName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createAncestralPlace, setCreateAncestralPlace] = useState('');

  // Form states for joining family
  const [joinCode, setJoinCode] = useState('');
  const [joinUserName, setJoinUserName] = useState('');

  // Family Settings Form
  const [editDesc, setEditDesc] = useState('');
  const [editAncestralPlace, setEditAncestralPlace] = useState('');
  const [editPrivacy, setEditPrivacy] = useState<'private' | 'family_only' | 'unlisted'>('private');
  const [savingSettings, setSavingSettings] = useState(false);

  // Invitations State
  const [invitations, setInvitations] = useState<ClientInvitation[]>([]);
  const [inviteEmailInput, setInviteEmailInput] = useState('');
  const [inviteRoleInput, setInviteRoleInput] = useState<'admin' | 'contributor' | 'reviewer' | 'viewer'>('contributor');
  const [inviteExpiryDays, setInviteExpiryDays] = useState<number>(7);
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [invitationFilter, setInvitationFilter] = useState<'all' | 'pending' | 'accepted' | 'revoked'>('all');

  // QR Code Modal
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrToken, setQrToken] = useState<string | null>(null);

  // Activity Feed
  const [activities, setActivities] = useState<ClientActivityItem[]>([]);
  const [refreshingActivity, setRefreshingActivity] = useState(false);

  // Multi-Family Switcher
  const [userFamilies, setUserFamilies] = useState<any[]>([]);
  const [showFamilySwitcher, setShowFamilySwitcher] = useState(false);

  // Server Settings Modal State
  const [isServerModalOpen, setIsServerModalOpen] = useState(false);
  const [serverInputUrl, setServerInputUrl] = useState(getServerUrl());
  const [serverStatusMessage, setServerStatusMessage] = useState<string | null>(null);
  const [serverTesting, setServerTesting] = useState(false);

  const loadCurrentSession = useCallback(async () => {
    setLoading(true);
    try {
      const active = await initSyncSession();
      setSession(active);
      if (active) {
        try {
          const details = await fetchFamilyDetails();
          setFamilyDetails(details);
          if (details) {
            setEditDesc(details.description || '');
            setEditAncestralPlace(details.ancestralLocation || '');
            setEditPrivacy(details.privacy || 'private');
          }

          // Load invitations and activity
          const [invs, acts, fams] = await Promise.all([
            listInvitationsClient().catch(() => []),
            fetchFamilyActivity().catch(() => []),
            listUserFamiliesClient().catch(() => [])
          ]);
          setInvitations(invs);
          setActivities(acts);
          setUserFamilies(fams);
        } catch (err) {
          console.warn('Could not fetch family details:', err);
        }
      }
    } catch (err) {
      console.error('Error loading session:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCurrentSession();
  }, [loadCurrentSession]);

  const handleCreateFamily = async () => {
    const famName = createFamilyName.trim();
    const uName = createUserName.trim();
    if (!famName) {
      Alert.alert('Required', 'Please enter a family name (e.g. The Sharma Family)');
      return;
    }
    if (!uName) {
      Alert.alert('Required', 'Please enter your name');
      return;
    }

    setLoading(true);
    try {
      const { family, session: newSession } = await createCloudFamily({
        familyName: famName,
        creatorName: uName
      });
      setSession(newSession);
      setFamilyDetails(family);

      // Save additional metadata
      if (createDescription.trim() || createAncestralPlace.trim()) {
        try {
          const updated = await updateFamilySettingsClient({
            description: createDescription.trim() || null,
            ancestralLocation: createAncestralPlace.trim() || null
          });
          setFamilyDetails(updated);
        } catch {}
      }

      Alert.alert(
        'Family Archive Created!',
        `Your shared family tree "${family.name}" is now live.\n\nInvite Code: ${family.inviteCode}\n\nShare with family members to view and collaborate!`
      );
    } catch (err) {
      Alert.alert(
        'Creation Failed',
        err instanceof Error
          ? `${err.message}\n\nMake sure your server is running and accessible at ${getServerUrl()}`
          : 'Failed to create family tree.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleJoinFamily = async () => {
    const code = joinCode.trim().toUpperCase();
    const uName = joinUserName.trim();
    if (!code) {
      Alert.alert('Required', 'Please enter the invite code (e.g. FAM-1234)');
      return;
    }
    if (!uName) {
      Alert.alert('Required', 'Please enter your name');
      return;
    }

    setLoading(true);
    try {
      const { family, session: newSession } = await joinCloudFamily({
        inviteCode: code,
        userName: uName
      });
      setSession(newSession);
      setFamilyDetails(family);

      if (newSession.membershipStatus === 'pending') {
        Alert.alert(
          'Join Request Submitted',
          `Your request to join "${family.name}" has been sent! The family admin will approve your request.`
        );
      } else {
        Alert.alert('Connected!', `You have joined "${family.name}"!`);
      }
    } catch (err) {
      Alert.alert(
        'Join Failed',
        err instanceof Error ? err.message : 'Could not join family tree. Check invite code and server connection.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const updated = await updateFamilySettingsClient({
        description: editDesc.trim() || null,
        ancestralLocation: editAncestralPlace.trim() || null,
        privacy: editPrivacy
      });
      setFamilyDetails(updated);
      Alert.alert('Settings Saved', 'Family archive settings updated successfully.');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not save settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCreateInvitation = async () => {
    setGeneratingInvite(true);
    try {
      const email = inviteEmailInput.trim();
      const inv = await createInvitationClient({
        ...(email ? { recipientEmail: email } : {}),
        role: inviteRoleInput,
        expiresInDays: inviteExpiryDays
      });
      setInvitations((prev) => [inv, ...prev.filter((i) => i.id !== inv.id)]);
      setInviteEmailInput('');

      const inviteLink = `https://yesterday.heritage/join?token=${inv.token}`;
      Alert.alert(
        'Invitation Created!',
        `Role: ${inv.role.toUpperCase()}\nExpires: ${new Date(inv.expiresAt).toLocaleDateString()}\n\nLink: ${inviteLink}`,
        [
          { text: 'Copy Link', onPress: () => handleCopyInviteLink(inv.token) },
          { text: 'Share', onPress: () => handleShareInviteNative(inv.token) },
          { text: 'Done', style: 'cancel' }
        ]
      );
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not create invitation.');
    } finally {
      setGeneratingInvite(false);
    }
  };

  const handleCopyInviteLink = async (token: string) => {
    const link = `https://yesterday.heritage/join?token=${token}`;
    Alert.alert('Link Ready to Share', link);
  };

  const handleShareInviteNative = async (token: string) => {
    const link = `https://yesterday.heritage/join?token=${token}`;
    const familyName = familyDetails?.name || 'our family';
    try {
      await Share.share({
        title: `Join ${familyName} on Yesterday`,
        message: `You're invited to join ${familyName}'s private family archive and genealogy tree on Yesterday.\n\nAccept your invitation here: ${link}`,
        url: Platform.OS === 'ios' ? link : undefined
      });
    } catch (err) {
      console.warn('Share dismissed:', err);
    }
  };

  const handleShareWhatsApp = async (token: string) => {
    const link = `https://yesterday.heritage/join?token=${token}`;
    const familyName = familyDetails?.name || 'our family';
    const text = encodeURIComponent(
      `Hello! You're invited to view and collaborate on ${familyName}'s private family tree on Yesterday.\n\nJoin here: ${link}`
    );
    const url = `whatsapp://send?text=${text}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      handleShareInviteNative(token);
    }
  };

  const handleRevokeInvitation = async (invId: string) => {
    try {
      await revokeInvitationClient(invId);
      setInvitations((prev) => prev.map((i) => (i.id === invId ? { ...i, status: 'revoked' } : i)));
      Alert.alert('Revoked', 'The invitation link has been revoked.');
    } catch (err) {
      Alert.alert('Error', 'Could not revoke invitation.');
    }
  };

  const handleResendInvitation = async (invId: string) => {
    try {
      const updated = await resendInvitationClient(invId);
      setInvitations((prev) => prev.map((i) => (i.id === invId ? updated : i)));
      Alert.alert('Invitation Refreshed', 'New invitation token generated and active for 7 days.');
    } catch (err) {
      Alert.alert('Error', 'Could not refresh invitation.');
    }
  };

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const result = await syncWithCloud();
      if (result.pendingApproval) {
        Alert.alert('Pending Approval', 'Your membership is pending approval from the family admin.');
      } else {
        setFamilyDetails(result.family);
        const currentPeople = await listPeople();
        Alert.alert(
          'Sync Complete',
          `Successfully synced with cloud! Your tree currently has ${currentPeople.length} relatives.`
        );
      }
      setSession(getCachedSession());
    } catch (err) {
      Alert.alert('Sync Error', err instanceof Error ? err.message : 'Failed to sync with cloud.');
    } finally {
      setSyncing(false);
    }
  };

  const handleApproveMember = async (member: FamilyMember, role: 'contributor' | 'reviewer' | 'viewer') => {
    try {
      const updated = await approveMember(member.id, role);
      setFamilyDetails(updated);
      Alert.alert('Member Approved', `${member.name} has been approved as a ${role}!`);
    } catch (err) {
      Alert.alert('Approval Error', err instanceof Error ? err.message : 'Failed to approve member.');
    }
  };

  const handleRemoveMember = async (member: FamilyMember) => {
    Alert.alert(
      'Remove Member',
      `Are you sure you want to remove ${member.name} from this family tree?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const updated = await removeMember(member.id);
              setFamilyDetails(updated);
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Could not remove member.');
            }
          }
        }
      ]
    );
  };

  const handleLeaveFamily = () => {
    Alert.alert(
      'Disconnect from Cloud?',
      'You will disconnect from this shared cloud tree. All relatives currently saved on your device will remain safely in your local offline archive.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            await leaveFamily();
            setSession(null);
            setFamilyDetails(null);
          }
        }
      ]
    );
  };

  const handleRefreshActivity = async () => {
    setRefreshingActivity(true);
    try {
      const acts = await fetchFamilyActivity();
      setActivities(acts);
    } finally {
      setRefreshingActivity(false);
    }
  };

  const handleSaveServer = () => {
    setServerUrl(serverInputUrl);
    setIsServerModalOpen(false);
    Alert.alert('Server URL Updated', `Saved: ${serverInputUrl}`);
  };

  const handleTestServer = async () => {
    setServerTesting(true);
    setServerStatusMessage(null);
    const result = await testServerConnection(serverInputUrl);
    setServerTesting(false);
    setServerStatusMessage(result.message);
  };

  const isOwnerOrAdmin = session?.userRole === 'owner' || session?.userRole === 'admin';
  const pendingMembers = familyDetails?.members.filter((m) => m.status === 'pending') ?? [];
  const activeMembers = familyDetails?.members.filter((m) => m.status === 'active') ?? [];

  const filteredInvitations = invitations.filter((inv) => {
    if (invitationFilter === 'all') return true;
    return inv.status === invitationFilter;
  });

  return (
    <Screen scroll={false}>
      <View style={styles.container}>
        {/* Top Navbar */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.ink} />
          </Pressable>

          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Family Collaboration Hub</Text>
            <Text style={styles.headerSubtitle}>
              {session ? `${session.familyName} · ${session.userRole.toUpperCase()}` : 'Connect with Relatives'}
            </Text>
          </View>

          <View style={styles.headerActions}>
            <Pressable
              onPress={() => {
                setServerInputUrl(getServerUrl());
                setServerStatusMessage(null);
                setIsServerModalOpen(true);
              }}
              style={styles.iconBtn}
            >
              <Ionicons name="server-outline" size={19} color={colors.terra} />
            </Pressable>
            {session ? (
              <Pressable onPress={handleManualSync} disabled={syncing} style={styles.iconBtn}>
                {syncing ? (
                  <ActivityIndicator size="small" color={colors.terra} />
                ) : (
                  <Ionicons name="sync-outline" size={20} color={colors.terra} />
                )}
              </Pressable>
            ) : null}
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={colors.terra} />
            <Text style={styles.loadingText}>Loading Family Archive Hub...</Text>
          </View>
        ) : session ? (
          /* ACTIVE FAMILY SESSION HUB */
          <View style={{ flex: 1 }}>
            {/* Tab Navigation Strip */}
            <View style={styles.tabNavRow}>
              {[
                { key: 'overview', label: 'Settings', icon: 'settings-outline' },
                { key: 'members', label: `Members (${activeMembers.length})`, icon: 'people-outline' },
                { key: 'invitations', label: 'Invite', icon: 'mail-outline' },
                { key: 'activity', label: 'Activity', icon: 'pulse-outline' }
              ].map((t) => (
                <Pressable
                  key={t.key}
                  onPress={() => setActiveTab(t.key as HubTab)}
                  style={[styles.tabItem, activeTab === t.key && styles.tabItemActive]}
                >
                  <Ionicons
                    name={t.icon as any}
                    size={14}
                    color={activeTab === t.key ? colors.white : colors.ink}
                  />
                  <Text style={[styles.tabLabel, activeTab === t.key && styles.tabLabelActive]}>
                    {t.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
              {/* TAB 1: OVERVIEW & SETTINGS */}
              {activeTab === 'overview' ? (
                <View style={styles.tabSection}>
                  <View style={styles.familyBadgeHero}>
                    <View style={styles.familyAvatar}>
                      <Text style={styles.familyAvatarText}>
                        {(familyDetails?.name || 'F').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.heroFamilyName}>{familyDetails?.name}</Text>
                    <Text style={styles.heroCodePill}>Invite Code: {familyDetails?.inviteCode}</Text>
                  </View>

                  <View style={styles.card}>
                    <Text style={styles.cardSectionTitle}>ARCHIVE DETAILS & PRIVACY</Text>

                    <Text style={styles.inputLabel}>DESCRIPTION</Text>
                    <TextInput
                      value={editDesc}
                      onChangeText={setEditDesc}
                      placeholder="e.g. Descendants of Dina Nath Sharma and family heritage archive."
                      placeholderTextColor={colors.muted}
                      style={styles.textInputArea}
                      multiline
                    />

                    <Text style={styles.inputLabel}>ANCESTRAL HOMETOWN / ORIGIN</Text>
                    <TextInput
                      value={editAncestralPlace}
                      onChangeText={setEditAncestralPlace}
                      placeholder="e.g. Jaipur, Rajasthan, India"
                      placeholderTextColor={colors.muted}
                      style={styles.singleTextInput}
                    />

                    <Text style={styles.inputLabel}>FAMILY PRIVACY MODE</Text>
                    <View style={styles.privacyOptionRow}>
                      {[
                        { key: 'private', label: 'Private (Invite Only)', icon: 'lock-closed' },
                        { key: 'family_only', label: 'Family Code Access', icon: 'people' },
                        { key: 'unlisted', label: 'Unlisted Shared Link', icon: 'link' }
                      ].map((p) => (
                        <Pressable
                          key={p.key}
                          onPress={() => setEditPrivacy(p.key as any)}
                          style={[styles.privacyPill, editPrivacy === p.key && styles.privacyPillActive]}
                        >
                          <Ionicons
                            name={p.icon as any}
                            size={12}
                            color={editPrivacy === p.key ? colors.white : colors.ink}
                          />
                          <Text style={[styles.privacyPillText, editPrivacy === p.key && styles.privacyPillTextActive]}>
                            {p.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    {isOwnerOrAdmin ? (
                      <Pressable
                        onPress={handleSaveSettings}
                        disabled={savingSettings}
                        style={styles.primaryActionBtn}
                      >
                        {savingSettings ? (
                          <ActivityIndicator color={colors.white} />
                        ) : (
                          <Text style={styles.primaryActionText}>Save Archive Settings</Text>
                        )}
                      </Pressable>
                    ) : (
                      <Text style={styles.readOnlyNotice}>
                        Only family Owner and Admins can modify settings.
                      </Text>
                    )}
                  </View>

                  {/* Disconnect Action */}
                  <Pressable onPress={handleLeaveFamily} style={styles.disconnectBtn}>
                    <Ionicons name="log-out-outline" size={16} color="#A23A2A" />
                    <Text style={styles.disconnectBtnText}>Disconnect from Cloud Archive</Text>
                  </Pressable>
                </View>
              ) : null}

              {/* TAB 2: MEMBERS & ROLES */}
              {activeTab === 'members' ? (
                <View style={styles.tabSection}>
                  {/* Pending Approvals */}
                  {pendingMembers.length > 0 ? (
                    <View style={styles.card}>
                      <Text style={[styles.cardSectionTitle, { color: colors.terra }]}>
                        PENDING APPROVALS ({pendingMembers.length})
                      </Text>
                      {pendingMembers.map((m) => (
                        <View key={m.id} style={styles.memberRow}>
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text style={styles.memberName}>{m.name}</Text>
                            <Text style={styles.memberSub}>Requested on {new Date(m.joinedAt).toLocaleDateString()}</Text>
                          </View>
                          {isOwnerOrAdmin ? (
                            <View style={styles.memberActionGroup}>
                              <Pressable
                                onPress={() => handleApproveMember(m, 'contributor')}
                                style={styles.approveBtn}
                              >
                                <Text style={styles.approveBtnText}>Approve</Text>
                              </Pressable>
                              <Pressable onPress={() => handleRemoveMember(m)} style={styles.rejectBtn}>
                                <Text style={styles.rejectBtnText}>Decline</Text>
                              </Pressable>
                            </View>
                          ) : (
                            <Text style={styles.pendingBadge}>Pending Admin</Text>
                          )}
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {/* Active Members */}
                  <View style={styles.card}>
                    <Text style={styles.cardSectionTitle}>FAMILY MEMBERS ({activeMembers.length})</Text>
                    {activeMembers.map((m) => (
                      <View key={m.id} style={styles.memberRow}>
                        <View style={styles.memberAvatar}>
                          <Text style={styles.memberAvatarText}>{m.name.charAt(0).toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1, gap: 2 }}>
                          <View style={styles.nameBadgeRow}>
                            <Text style={styles.memberName}>{m.name}</Text>
                            {m.id === session.userId ? (
                              <View style={styles.youBadge}><Text style={styles.youBadgeText}>YOU</Text></View>
                            ) : null}
                          </View>
                          <Text style={styles.memberSub}>
                            Role: {m.role.toUpperCase()} · Joined {new Date(m.joinedAt).toLocaleDateString()}
                          </Text>
                        </View>
                        {isOwnerOrAdmin && m.id !== session.userId && m.role !== 'owner' ? (
                          <Pressable onPress={() => handleRemoveMember(m)} style={styles.iconOnlyBtn}>
                            <Ionicons name="trash-outline" size={16} color="#A23A2A" />
                          </Pressable>
                        ) : null}
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {/* TAB 3: INVITATIONS */}
              {activeTab === 'invitations' ? (
                <View style={styles.tabSection}>
                  {/* Create New Invite Card */}
                  <View style={styles.card}>
                    <Text style={styles.cardSectionTitle}>INVITE A RELATIVE</Text>
                    <Text style={styles.cardHelperText}>
                      Generate a secure, revocable invitation link. Share via WhatsApp, Email, or QR Code.
                    </Text>

                    <Text style={styles.inputLabel}>ASSIGN PERMISSION ROLE</Text>
                    <View style={styles.rolePickerRow}>
                      {[
                        { key: 'contributor', label: 'Contributor (Add & Edit)' },
                        { key: 'reviewer', label: 'Reviewer (Verify Facts)' },
                        { key: 'viewer', label: 'Viewer (Read Only)' }
                      ].map((r) => (
                        <Pressable
                          key={r.key}
                          onPress={() => setInviteRoleInput(r.key as any)}
                          style={[styles.rolePill, inviteRoleInput === r.key && styles.rolePillActive]}
                        >
                          <Text style={[styles.rolePillText, inviteRoleInput === r.key && styles.rolePillTextActive]}>
                            {r.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    <Text style={styles.inputLabel}>RECIPIENT EMAIL (OPTIONAL)</Text>
                    <TextInput
                      value={inviteEmailInput}
                      onChangeText={setInviteEmailInput}
                      placeholder="e.g. brother@family.com"
                      placeholderTextColor={colors.muted}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      style={styles.singleTextInput}
                    />

                    <Pressable
                      onPress={handleCreateInvitation}
                      disabled={generatingInvite}
                      style={styles.primaryActionBtn}
                    >
                      {generatingInvite ? (
                        <ActivityIndicator color={colors.white} />
                      ) : (
                        <Text style={styles.primaryActionText}>Generate Secure Invitation Link</Text>
                      )}
                    </Pressable>
                  </View>

                  {/* Invitations List & Filter */}
                  <View style={styles.card}>
                    <View style={styles.filterRow}>
                      <Text style={styles.cardSectionTitle}>INVITATIONS ({filteredInvitations.length})</Text>
                      <View style={styles.miniFilterPills}>
                        {['all', 'pending', 'accepted', 'revoked'].map((f) => (
                          <Pressable
                            key={f}
                            onPress={() => setInvitationFilter(f as any)}
                            style={[styles.miniFilterPill, invitationFilter === f && styles.miniFilterPillActive]}
                          >
                            <Text style={[styles.miniFilterText, invitationFilter === f && styles.miniFilterTextActive]}>
                              {f.toUpperCase()}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>

                    {filteredInvitations.length === 0 ? (
                      <View style={styles.emptyBox}>
                        <Text style={styles.emptyText}>No invitations found in this category.</Text>
                      </View>
                    ) : (
                      filteredInvitations.map((inv) => (
                        <View key={inv.id} style={styles.inviteItem}>
                          <View style={{ flex: 1, gap: 2 }}>
                            <View style={styles.nameBadgeRow}>
                              <Text style={styles.inviteRecipient}>
                                {inv.recipientEmail || 'Shareable Link'}
                              </Text>
                              <View
                                style={[
                                  styles.statusChip,
                                  inv.status === 'accepted' && { backgroundColor: '#EDF5EB' },
                                  inv.status === 'revoked' && { backgroundColor: '#FDEAE8' }
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.statusChipText,
                                    inv.status === 'accepted' && { color: colors.green },
                                    inv.status === 'revoked' && { color: '#A23A2A' }
                                  ]}
                                >
                                  {inv.status.toUpperCase()}
                                </Text>
                              </View>
                            </View>
                            <Text style={styles.inviteMeta}>
                              Role: {inv.role.toUpperCase()} · Expires {new Date(inv.expiresAt).toLocaleDateString()}
                            </Text>
                          </View>

                          {/* Action Buttons */}
                          <View style={styles.inviteActionRow}>
                            <Pressable
                              onPress={() => handleShareWhatsApp(inv.token)}
                              style={styles.quickIconBtn}
                              accessibilityLabel="Share on WhatsApp"
                            >
                              <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
                            </Pressable>
                            <Pressable
                              onPress={() => handleShareInviteNative(inv.token)}
                              style={styles.quickIconBtn}
                              accessibilityLabel="Share"
                            >
                              <Ionicons name="share-social-outline" size={16} color={colors.terra} />
                            </Pressable>
                            <Pressable
                              onPress={() => handleCopyInviteLink(inv.token)}
                              style={styles.quickIconBtn}
                              accessibilityLabel="Copy Link"
                            >
                              <Ionicons name="copy-outline" size={16} color={colors.ink} />
                            </Pressable>
                            {inv.status === 'pending' ? (
                              <Pressable
                                onPress={() => handleRevokeInvitation(inv.id)}
                                style={styles.quickIconBtn}
                                accessibilityLabel="Revoke"
                              >
                                <Ionicons name="close-circle-outline" size={16} color="#A23A2A" />
                              </Pressable>
                            ) : inv.status === 'revoked' || inv.status === 'expired' ? (
                              <Pressable
                                onPress={() => handleResendInvitation(inv.id)}
                                style={styles.quickIconBtn}
                                accessibilityLabel="Resend"
                              >
                                <Ionicons name="refresh-outline" size={16} color={colors.terra} />
                              </Pressable>
                            ) : null}
                          </View>
                        </View>
                      ))
                    )}
                  </View>
                </View>
              ) : null}

              {/* TAB 4: REAL-TIME ACTIVITY FEED */}
              {activeTab === 'activity' ? (
                <View style={styles.tabSection}>
                  <View style={styles.activityHeaderRow}>
                    <Text style={styles.cardSectionTitle}>FAMILY ACTIVITY STREAM</Text>
                    <Pressable
                      onPress={handleRefreshActivity}
                      disabled={refreshingActivity}
                      style={styles.refreshActivityBtn}
                    >
                      {refreshingActivity ? (
                        <ActivityIndicator size="small" color={colors.terra} />
                      ) : (
                        <Ionicons name="reload" size={14} color={colors.terra} />
                      )}
                      <Text style={styles.refreshActivityText}>Refresh</Text>
                    </Pressable>
                  </View>

                  {activities.length === 0 ? (
                    <View style={styles.card}>
                      <View style={styles.emptyBox}>
                        <Ionicons name="pulse-outline" size={32} color={colors.border} />
                        <Text style={styles.emptyText}>No recent activities recorded yet.</Text>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.card}>
                      {activities.map((a) => (
                        <View key={a.id} style={styles.activityItem}>
                          <View style={styles.activityIconWrap}>
                            <Ionicons
                              name={
                                a.actionType.includes('person')
                                  ? 'person-add'
                                  : a.actionType.includes('story')
                                  ? 'book'
                                  : a.actionType.includes('comment')
                                  ? 'chatbubble'
                                  : 'sparkles'
                              }
                              size={14}
                              color={colors.terra}
                            />
                          </View>
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text style={styles.activityTitle}>{a.entityTitle}</Text>
                            <Text style={styles.activityMeta}>
                              By {a.actorName} · {new Date(a.timestamp).toLocaleString()}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ) : null}
            </ScrollView>
          </View>
        ) : (
          /* NO ACTIVE SESSION: CREATE OR JOIN FAMILY */
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {/* Create Family Card */}
            <View style={styles.card}>
              <View style={styles.cardIconHeader}>
                <Ionicons name="add-circle" size={26} color={colors.terra} />
                <Text style={styles.cardBigTitle}>Create Family Archive</Text>
              </View>
              <Text style={styles.cardHelperText}>
                Start a private, shared heritage space. Upload memories, build your family tree together, and invite relatives.
              </Text>

              <Text style={styles.inputLabel}>FAMILY NAME *</Text>
              <TextInput
                value={createFamilyName}
                onChangeText={setCreateFamilyName}
                placeholder="e.g. The Sharma Family"
                placeholderTextColor={colors.muted}
                style={styles.singleTextInput}
              />

              <Text style={styles.inputLabel}>YOUR NAME *</Text>
              <TextInput
                value={createUserName}
                onChangeText={setCreateUserName}
                placeholder="e.g. Ramesh Sharma"
                placeholderTextColor={colors.muted}
                style={styles.singleTextInput}
              />

              <Text style={styles.inputLabel}>ANCESTRAL HOMETOWN / ORIGIN (OPTIONAL)</Text>
              <TextInput
                value={createAncestralPlace}
                onChangeText={setCreateAncestralPlace}
                placeholder="e.g. Jaipur, Rajasthan"
                placeholderTextColor={colors.muted}
                style={styles.singleTextInput}
              />

              <Pressable onPress={handleCreateFamily} disabled={loading} style={styles.primaryActionBtn}>
                <Text style={styles.primaryActionText}>Create Family Archive</Text>
              </Pressable>
            </View>

            {/* Join Family Card */}
            <View style={styles.card}>
              <View style={styles.cardIconHeader}>
                <Ionicons name="people-circle" size={26} color={colors.green} />
                <Text style={styles.cardBigTitle}>Join Existing Family</Text>
              </View>
              <Text style={styles.cardHelperText}>
                Enter the invite code or join token sent by a family member to collaborate.
              </Text>

              <Text style={styles.inputLabel}>INVITE CODE *</Text>
              <TextInput
                value={joinCode}
                onChangeText={setJoinCode}
                placeholder="e.g. FAM-1234 or Token"
                placeholderTextColor={colors.muted}
                autoCapitalize="characters"
                style={styles.singleTextInput}
              />

              <Text style={styles.inputLabel}>YOUR NAME *</Text>
              <TextInput
                value={joinUserName}
                onChangeText={setJoinUserName}
                placeholder="e.g. Sunita Sharma"
                placeholderTextColor={colors.muted}
                style={styles.singleTextInput}
              />

              <Pressable
                onPress={handleJoinFamily}
                disabled={loading}
                style={[styles.primaryActionBtn, { backgroundColor: colors.green }]}
              >
                <Text style={styles.primaryActionText}>Join Family Archive</Text>
              </Pressable>
            </View>
          </ScrollView>
        )}

        {/* SERVER SETTINGS MODAL */}
        <Modal
          visible={isServerModalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setIsServerModalOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Backend Server Configuration</Text>
                <Pressable onPress={() => setIsServerModalOpen(false)}>
                  <Ionicons name="close" size={20} color={colors.ink} />
                </Pressable>
              </View>

              <Text style={styles.inputLabel}>API SERVER URL</Text>
              <TextInput
                value={serverInputUrl}
                onChangeText={setServerInputUrl}
                placeholder="https://...trycloudflare.com or http://10.x.x.x:3333"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                style={styles.singleTextInput}
              />

              {serverStatusMessage ? (
                <Text style={styles.serverStatusMsg}>{serverStatusMessage}</Text>
              ) : null}

              <View style={styles.serverActionRow}>
                <Pressable
                  onPress={handleTestServer}
                  disabled={serverTesting}
                  style={styles.testServerBtn}
                >
                  {serverTesting ? (
                    <ActivityIndicator size="small" color={colors.ink} />
                  ) : (
                    <Text style={styles.testServerText}>Test Connection</Text>
                  )}
                </Pressable>
                <Pressable onPress={handleSaveServer} style={styles.saveServerBtn}>
                  <Text style={styles.saveServerText}>Save URL</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  iconBtn: { padding: 6 },
  headerTitleWrap: { alignItems: 'center', gap: 2 },
  headerTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  headerSubtitle: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  tabNavRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 3,
    marginVertical: 8
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: radius.md - 2
  },
  tabItemActive: { backgroundColor: colors.terra },
  tabLabel: { color: colors.ink, fontSize: 11, fontWeight: '700' },
  tabLabelActive: { color: colors.white },
  scrollContent: { paddingVertical: 10, gap: 14 },
  tabSection: { gap: 14 },
  familyBadgeHero: {
    alignItems: 'center',
    backgroundColor: colors.surfaceWarm,
    borderRadius: radius.lg,
    padding: 20,
    gap: 8,
    borderWidth: 1,
    borderColor: '#EBDCCE'
  },
  familyAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.terra,
    alignItems: 'center',
    justifyContent: 'center'
  },
  familyAvatarText: { color: colors.white, fontSize: 26, fontWeight: '800' },
  heroFamilyName: { color: colors.ink, fontSize: 20, fontWeight: '800' },
  heroCodePill: {
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '700',
    color: colors.terra,
    borderWidth: 1,
    borderColor: colors.border
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10
  },
  cardIconHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardBigTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  cardSectionTitle: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2
  },
  cardHelperText: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  inputLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 6
  },
  singleTextInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    fontSize: 13
  },
  textInputArea: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    color: colors.ink,
    fontSize: 13,
    minHeight: 80,
    textAlignVertical: 'top'
  },
  privacyOptionRow: { gap: 6 },
  privacyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border
  },
  privacyPillActive: { backgroundColor: colors.terra, borderColor: colors.terra },
  privacyPillText: { color: colors.ink, fontSize: 12, fontWeight: '600' },
  privacyPillTextActive: { color: colors.white },
  primaryActionBtn: {
    backgroundColor: colors.terra,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8
  },
  primaryActionText: { color: colors.white, fontSize: 13, fontWeight: '800' },
  readOnlyNotice: { color: colors.muted, fontSize: 11, fontStyle: 'italic', marginTop: 4 },
  disconnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: '#FDF2F0'
  },
  disconnectBtnText: { color: '#A23A2A', fontSize: 12, fontWeight: '700' },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  memberAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center'
  },
  memberAvatarText: { color: colors.terra, fontWeight: '800', fontSize: 14 },
  nameBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  memberName: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  memberSub: { color: colors.muted, fontSize: 11 },
  youBadge: {
    backgroundColor: '#EDF5EB',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  youBadgeText: { color: colors.green, fontSize: 9, fontWeight: '800' },
  memberActionGroup: { flexDirection: 'row', gap: 6 },
  approveBtn: {
    backgroundColor: colors.green,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6
  },
  approveBtnText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  rejectBtn: {
    backgroundColor: '#FDEAE8',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6
  },
  rejectBtnText: { color: '#A23A2A', fontSize: 11, fontWeight: '700' },
  pendingBadge: { color: colors.terra, fontSize: 11, fontWeight: '700' },
  iconOnlyBtn: { padding: 6 },
  rolePickerRow: { gap: 6 },
  rolePill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border
  },
  rolePillActive: { backgroundColor: colors.terra, borderColor: colors.terra },
  rolePillText: { color: colors.ink, fontSize: 12, fontWeight: '600' },
  rolePillTextActive: { color: colors.white },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  miniFilterPills: { flexDirection: 'row', gap: 4 },
  miniFilterPill: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: colors.surface
  },
  miniFilterPillActive: { backgroundColor: colors.terra },
  miniFilterText: { color: colors.ink, fontSize: 9, fontWeight: '700' },
  miniFilterTextActive: { color: colors.white },
  inviteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  inviteRecipient: { color: colors.ink, fontSize: 12, fontWeight: '700' },
  inviteMeta: { color: colors.muted, fontSize: 10 },
  statusChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: colors.surface
  },
  statusChipText: { fontSize: 8, fontWeight: '800', color: colors.muted },
  inviteActionRow: { flexDirection: 'row', gap: 4 },
  quickIconBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: colors.surfaceWarm
  },
  activityHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  refreshActivityBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4
  },
  refreshActivityText: { color: colors.terra, fontSize: 11, fontWeight: '700' },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  activityIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2
  },
  activityTitle: { color: colors.ink, fontSize: 12, fontWeight: '600' },
  activityMeta: { color: colors.muted, fontSize: 10 },
  emptyBox: { alignItems: 'center', padding: 20, gap: 6 },
  emptyText: { color: colors.muted, fontSize: 12, textAlign: 'center' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 20,
    gap: 12
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 8
  },
  modalTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  serverStatusMsg: { color: colors.terra, fontSize: 11, fontStyle: 'italic' },
  serverActionRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  testServerBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingVertical: 10,
    borderRadius: radius.sm,
    alignItems: 'center'
  },
  testServerText: { color: colors.ink, fontSize: 12, fontWeight: '700' },
  saveServerBtn: {
    flex: 1,
    backgroundColor: colors.terra,
    paddingVertical: 10,
    borderRadius: radius.sm,
    alignItems: 'center'
  },
  saveServerText: { color: colors.white, fontSize: 12, fontWeight: '700' }
});

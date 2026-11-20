import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import * as ImagePicker from 'expo-image-picker';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState
} from 'expo-audio';
import { colors, radius } from '../theme';
import {
  addPersonMedia,
  deletePersonMedia,
  listPersonMedia,
  updatePersonProfile,
  addPersonEvent,
  listPersonEvents,
  type LocalLifeEvent,
  type FamilyRelationship,
  type Person,
  type PersonMedia
} from '../lib/database';
import { fetchPersonEvidence, type FactEvidenceItem } from '../lib/api';

interface PersonProfileModalProps {
  person: Person | null;
  allPeople: Person[];
  relationships: FamilyRelationship[];
  onClose: () => void;
  onPersonUpdated: () => void;
  onDeletePerson: (id: string) => void;
  onSelectRelative: (person: Person) => void;
}

export function PersonProfileModal({
  person,
  allPeople,
  relationships,
  onClose,
  onPersonUpdated,
  onDeletePerson,
  onSelectRelative
}: PersonProfileModalProps) {
  if (!person) return null;

  const [activeTab, setActiveTab] = useState<'info' | 'photos' | 'audio' | 'family' | 'timeline' | 'evidence'>('info');
  const [isEditing, setIsEditing] = useState(false);

  // Form State
  const [name, setName] = useState(person.name);
  const [relationship, setRelationship] = useState(person.relationship || '');
  const [gender, setGender] = useState<'male' | 'female' | 'other'>(person.gender || 'male');
  const [birthYear, setBirthYear] = useState(person.birthYear ? String(person.birthYear) : '');
  const [birthPlace, setBirthPlace] = useState(person.birthPlace || '');
  const [notes, setNotes] = useState(person.notes || '');
  const [avatarUri, setAvatarUri] = useState<string | null>(person.avatarUri || null);

  // Media
  const [mediaList, setMediaList] = useState<PersonMedia[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);

  // Timeline & Evidence
  const [timelineEvents, setTimelineEvents] = useState<LocalLifeEvent[]>([]);
  const [evidenceItems, setEvidenceItems] = useState<FactEvidenceItem[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventType, setNewEventType] = useState('life_event');
  const [newEventDate, setNewEventDate] = useState('');
  const [newEventPlace, setNewEventPlace] = useState('');
  const [newEventDesc, setNewEventDesc] = useState('');

  // Audio Recorder State
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, directory: 'document' });
  const recorderState = useAudioRecorderState(recorder);
  const [audioTitle, setAudioTitle] = useState('');

  useEffect(() => {
    setName(person.name);
    setRelationship(person.relationship || '');
    setGender(person.gender || 'male');
    setBirthYear(person.birthYear ? String(person.birthYear) : '');
    setBirthPlace(person.birthPlace || '');
    setNotes(person.notes || '');
    setAvatarUri(person.avatarUri || null);
    setIsEditing(false);

    loadMedia(person.id);
    loadTimeline(person.id);
    loadEvidence(person.id);
  }, [person]);

  const loadTimeline = async (personId: string) => {
    setLoadingTimeline(true);
    try {
      const items = await listPersonEvents(personId);
      setTimelineEvents(items);
    } catch (err) {
      console.warn('Failed to load local timeline:', err);
    } finally {
      setLoadingTimeline(false);
    }
  };

  const loadEvidence = async (personId: string) => {
    setLoadingEvidence(true);
    try {
      const res = await fetchPersonEvidence(personId);
      setEvidenceItems(res.evidence || []);
    } catch (err) {
      console.warn('Failed to load evidence:', err);
    } finally {
      setLoadingEvidence(false);
    }
  };

  const handleAddEvent = async () => {
    if (!newEventTitle.trim()) {
      Alert.alert('Title Required', 'Please enter a title for this life event.');
      return;
    }
    await addPersonEvent({
      personId: person.id,
      eventType: newEventType,
      title: newEventTitle.trim(),
      description: newEventDesc.trim() || null,
      eventDate: newEventDate.trim() || null,
      place: newEventPlace.trim() || null,
      evidence: 'Added by family member'
    });
    setNewEventTitle('');
    setNewEventDate('');
    setNewEventPlace('');
    setNewEventDesc('');
    setShowAddEvent(false);
    loadTimeline(person.id);
    Alert.alert('Event Added', 'Milestone recorded to relative timeline.');
  };

  const loadMedia = async (personId: string) => {
    setLoadingMedia(true);
    try {
      const items = await listPersonMedia(personId);
      setMediaList(items);
    } catch (err) {
      console.error('Failed to load media:', err);
    } finally {
      setLoadingMedia(false);
    }
  };

  // Pick or Change Display Picture (DP)
  const handleChangeDP = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Needed', 'Please allow photo gallery access to set a profile photo.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8
      });

      if (!result.canceled && result.assets[0]?.uri) {
        const pickedUri = result.assets[0].uri;
        setAvatarUri(pickedUri);
        await updatePersonProfile(person.id, { avatarUri: pickedUri });
        onPersonUpdated();

        // Also add as a photo in media list
        await addPersonMedia({
          personId: person.id,
          type: 'image',
          uri: pickedUri,
          title: 'Profile Picture (DP)'
        });
        loadMedia(person.id);
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not pick photo');
    }
  };

  // Add a Photo / Image to Gallery
  const handleAddPhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        quality: 0.85
      });

      if (!result.canceled && result.assets[0]?.uri) {
        const uri = result.assets[0].uri;
        await addPersonMedia({
          personId: person.id,
          type: 'image',
          uri,
          title: `Photo of ${person.name}`
        });
        loadMedia(person.id);
        Alert.alert('Photo Added', 'Successfully attached photo to this relative.');
      }
    } catch (err) {
      Alert.alert('Error', 'Could not attach photo.');
    }
  };

  // Add a Video to Gallery
  const handleAddVideo = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        allowsEditing: true,
        quality: 0.8
      });

      if (!result.canceled && result.assets[0]?.uri) {
        const uri = result.assets[0].uri;
        await addPersonMedia({
          personId: person.id,
          type: 'video',
          uri,
          title: `Video Memory of ${person.name}`
        });
        loadMedia(person.id);
        Alert.alert('Video Attached', 'Successfully attached video to this relative.');
      }
    } catch (err) {
      Alert.alert('Error', 'Could not attach video.');
    }
  };

  // Record an In-Place Voice Story
  const toggleAudioRecord = async () => {
    if (recorderState.isRecording) {
      try {
        await recorder.stop();
        if (recorder.uri) {
          const defaultTitle = audioTitle.trim() || `Voice memory of ${person.name}`;
          await addPersonMedia({
            personId: person.id,
            type: 'audio',
            uri: recorder.uri,
            title: defaultTitle
          });
          setAudioTitle('');
          loadMedia(person.id);
          Alert.alert('Voice Memory Saved', 'Successfully saved audio memory for this relative.');
        }
      } catch (err) {
        Alert.alert('Recording Error', 'Could not save voice recording.');
      }
    } else {
      try {
        const permission = await AudioModule.requestRecordingPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Microphone Needed', 'Allow microphone access to record family memories.');
          return;
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
      } catch (err) {
        Alert.alert('Error', 'Could not start recording.');
      }
    }
  };

  const handleDeleteMedia = async (mediaId: string) => {
    Alert.alert('Delete Media?', 'Remove this memory from this relative’s archive?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deletePersonMedia(mediaId);
          loadMedia(person.id);
        }
      }
    ]);
  };

  const handleSaveProfile = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Name Required', 'Please enter a name for this relative.');
      return;
    }

    const birthYearNum = birthYear.trim() ? parseInt(birthYear.trim(), 10) : null;
    await updatePersonProfile(person.id, {
      name: trimmed,
      relationship: relationship.trim() || null,
      gender,
      birthYear: birthYearNum,
      birthPlace: birthPlace.trim() || null,
      notes: notes.trim() || null,
      avatarUri
    });

    setIsEditing(false);
    onPersonUpdated();
    Alert.alert('Profile Saved', 'Relative profile details updated successfully.');
  };

  // Find immediate family members
  const directKin = React.useMemo(() => {
    const parents: Person[] = [];
    const children: Person[] = [];
    const spouses: Person[] = [];
    const siblings: Person[] = [];

    const personNameLower = person.name.toLowerCase().trim();

    for (const r of relationships) {
      const a = r.personA.toLowerCase().trim();
      const b = r.personB.toLowerCase().trim();
      const rel = r.relation.toLowerCase().trim();

      if (a === personNameLower) {
        const other = allPeople.find(p => p.name.toLowerCase().trim() === b);
        if (other) {
          if (rel === 'parent' || rel === 'father' || rel === 'mother') children.push(other);
          else if (rel === 'child' || rel === 'son' || rel === 'daughter') parents.push(other);
          else if (rel === 'spouse' || rel === 'husband' || rel === 'wife' || rel === 'partner') spouses.push(other);
          else if (rel === 'sibling' || rel === 'brother' || rel === 'sister') siblings.push(other);
        }
      } else if (b === personNameLower) {
        const other = allPeople.find(p => p.name.toLowerCase().trim() === a);
        if (other) {
          if (rel === 'parent' || rel === 'father' || rel === 'mother') parents.push(other);
          else if (rel === 'child' || rel === 'son' || rel === 'daughter') children.push(other);
          else if (rel === 'spouse' || rel === 'husband' || rel === 'wife' || rel === 'partner') spouses.push(other);
          else if (rel === 'sibling' || rel === 'brother' || rel === 'sister') siblings.push(other);
        }
      }
    }

    return { parents, children, spouses, siblings };
  }, [person, allPeople, relationships]);

  const photosList = mediaList.filter(m => m.type === 'image');
  const audioList = mediaList.filter(m => m.type === 'audio');
  const videoList = mediaList.filter(m => m.type === 'video');

  const recordingSeconds = Math.floor(recorderState.durationMillis / 1000);
  const recTime = `${Math.floor(recordingSeconds / 60)
    .toString()
    .padStart(2, '0')}:${(recordingSeconds % 60).toString().padStart(2, '0')}`;

  const isFemale = gender === 'female';
  const isMale = gender === 'male';

  return (
    <Modal
      animationType="slide"
      transparent={false}
      visible={Boolean(person)}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Top Navbar */}
        <View style={styles.topBar}>
          <Pressable onPress={onClose} style={styles.iconBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.ink} />
          </Pressable>
          <Text style={styles.topBarTitle}>Family Member Profile</Text>
          <Pressable
            onPress={() => (isEditing ? handleSaveProfile() : setIsEditing(true))}
            style={styles.editToggleBtn}
          >
            <Ionicons name={isEditing ? 'checkmark' : 'create-outline'} size={18} color={colors.terra} />
            <Text style={styles.editToggleText}>{isEditing ? 'Save' : 'Edit'}</Text>
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {/* Cover & Profile Header with DP */}
          <View style={styles.profileHeader}>
            <View style={styles.dpWrapper}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.dpImage} />
              ) : (
                <View
                  style={[
                    styles.dpPlaceholder,
                    isFemale && styles.dpFemale,
                    isMale && styles.dpMale
                  ]}
                >
                  <Text style={styles.dpInitial}>{person.name.charAt(0).toUpperCase()}</Text>
                </View>
              )}

              <Pressable onPress={handleChangeDP} style={styles.cameraBadge}>
                <Ionicons name="camera" size={16} color={colors.white} />
              </Pressable>
            </View>

            <Text style={styles.profileName}>{name}</Text>

            <View style={styles.badgesRow}>
              <View style={styles.relationTag}>
                <Text style={styles.relationTagText}>{relationship || 'Family Member'}</Text>
              </View>
              {gender ? (
                <View style={styles.genderTag}>
                  <Text style={styles.genderTagText}>{isFemale ? '♀ Female' : isMale ? '♂ Male' : 'Other'}</Text>
                </View>
              ) : null}
              {birthYear ? (
                <View style={styles.metaTag}>
                  <Text style={styles.metaTagText}>Born {birthYear}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Navigation Tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabsRow}>
            <Pressable
              onPress={() => setActiveTab('info')}
              style={[styles.tabBtn, activeTab === 'info' && styles.tabBtnActive]}
            >
              <Ionicons name="person-outline" size={14} color={activeTab === 'info' ? colors.terra : colors.muted} />
              <Text style={[styles.tabText, activeTab === 'info' && styles.tabTextActive]}>Details</Text>
            </Pressable>

            <Pressable
              onPress={() => setActiveTab('photos')}
              style={[styles.tabBtn, activeTab === 'photos' && styles.tabBtnActive]}
            >
              <Ionicons name="images-outline" size={14} color={activeTab === 'photos' ? colors.terra : colors.muted} />
              <Text style={[styles.tabText, activeTab === 'photos' && styles.tabTextActive]}>
                Photos ({photosList.length})
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setActiveTab('audio')}
              style={[styles.tabBtn, activeTab === 'audio' && styles.tabBtnActive]}
            >
              <Ionicons name="mic-outline" size={14} color={activeTab === 'audio' ? colors.terra : colors.muted} />
              <Text style={[styles.tabText, activeTab === 'audio' && styles.tabTextActive]}>
                Voice ({audioList.length})
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setActiveTab('family')}
              style={[styles.tabBtn, activeTab === 'family' && styles.tabBtnActive]}
            >
              <Ionicons name="git-network-outline" size={14} color={activeTab === 'family' ? colors.terra : colors.muted} />
              <Text style={[styles.tabText, activeTab === 'family' && styles.tabTextActive]}>Kin</Text>
            </Pressable>

            <Pressable
              onPress={() => setActiveTab('timeline')}
              style={[styles.tabBtn, activeTab === 'timeline' && styles.tabBtnActive]}
            >
              <Ionicons name="time-outline" size={14} color={activeTab === 'timeline' ? colors.terra : colors.muted} />
              <Text style={[styles.tabText, activeTab === 'timeline' && styles.tabTextActive]}>Timeline</Text>
            </Pressable>

            <Pressable
              onPress={() => setActiveTab('evidence')}
              style={[styles.tabBtn, activeTab === 'evidence' && styles.tabBtnActive]}
            >
              <Ionicons name="shield-checkmark-outline" size={14} color={activeTab === 'evidence' ? colors.terra : colors.muted} />
              <Text style={[styles.tabText, activeTab === 'evidence' && styles.tabTextActive]}>Evidence</Text>
            </Pressable>
          </ScrollView>

          {/* TAB 1: DETAILS & BIOGRAPHY */}
          {activeTab === 'info' ? (
            <View style={styles.tabContent}>
              {isEditing ? (
                <View style={styles.editCard}>
                  <Text style={styles.inputLabel}>FULL NAME *</Text>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="Full name"
                    style={styles.textInput}
                  />

                  <Text style={styles.inputLabel}>RELATIONSHIP TO YOU</Text>
                  <TextInput
                    value={relationship}
                    onChangeText={setRelationship}
                    placeholder="Father, Mother, Sister, etc."
                    style={styles.textInput}
                  />

                  <Text style={styles.inputLabel}>GENDER</Text>
                  <View style={styles.genderOptions}>
                    {(['male', 'female', 'other'] as const).map(g => (
                      <Pressable
                        key={g}
                        onPress={() => setGender(g)}
                        style={[styles.genderChoice, gender === g && styles.genderChoiceActive]}
                      >
                        <Text style={[styles.genderChoiceText, gender === g && styles.genderChoiceTextActive]}>
                          {g.toUpperCase()}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text style={styles.inputLabel}>BIRTH YEAR</Text>
                  <TextInput
                    value={birthYear}
                    onChangeText={setBirthYear}
                    placeholder="e.g. 1965"
                    keyboardType="numeric"
                    style={styles.textInput}
                  />

                  <Text style={styles.inputLabel}>BIRTHPLACE / HOMETOWN</Text>
                  <TextInput
                    value={birthPlace}
                    onChangeText={setBirthPlace}
                    placeholder="e.g. Varanasi, India"
                    style={styles.textInput}
                  />

                  <Text style={styles.inputLabel}>NOTES & STORIES</Text>
                  <TextInput
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Family stories, occupations, memories..."
                    multiline
                    style={[styles.textInput, { height: 90 }]}
                  />

                  <Pressable onPress={handleSaveProfile} style={styles.saveBtn}>
                    <Text style={styles.saveBtnText}>Save Changes</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.detailsCard}>
                  <View style={styles.detailRow}>
                    <Ionicons name="calendar-outline" size={18} color={colors.terra} />
                    <View>
                      <Text style={styles.detailLabel}>BIRTH DETAILS</Text>
                      <Text style={styles.detailValue}>
                        {birthYear ? `Born ${birthYear}` : 'Year not specified'}
                        {birthPlace ? ` in ${birthPlace}` : ''}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.detailRow}>
                    <Ionicons name="document-text-outline" size={18} color={colors.terra} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.detailLabel}>STORIES & BIOGRAPHY</Text>
                      <Text style={styles.detailValue}>
                        {notes || 'No notes added yet. Tap Edit above to add family memories, occupations, or stories.'}
                      </Text>
                    </View>
                  </View>
                </View>
              )}
            </View>
          ) : null}

          {/* TAB 2: PHOTOS & IMAGES */}
          {activeTab === 'photos' ? (
            <View style={styles.tabContent}>
              <View style={styles.mediaActionBar}>
                <Pressable onPress={handleAddPhoto} style={styles.addMediaBtn}>
                  <Ionicons name="image" size={16} color={colors.white} />
                  <Text style={styles.addMediaBtnText}>Add Photo to Gallery</Text>
                </Pressable>
                <Pressable onPress={handleAddVideo} style={styles.addMediaSecondaryBtn}>
                  <Ionicons name="videocam" size={16} color={colors.terra} />
                  <Text style={styles.addMediaSecondaryBtnText}>Add Video</Text>
                </Pressable>
              </View>

              {photosList.length === 0 && videoList.length === 0 ? (
                <View style={styles.emptyMedia}>
                  <Ionicons name="images-outline" size={40} color={colors.muted} />
                  <Text style={styles.emptyMediaTitle}>No Photos or Videos Yet</Text>
                  <Text style={styles.emptyMediaCopy}>
                    Upload vintage photographs, portraits, or video clips of {person.name}.
                  </Text>
                </View>
              ) : (
                <View style={styles.photosGrid}>
                  {photosList.map(item => (
                    <View key={item.id} style={styles.photoCard}>
                      <Image source={{ uri: item.uri }} style={styles.gridImage} />
                      <View style={styles.photoCaptionBar}>
                        <Text style={styles.photoTitle} numberOfLines={1}>
                          {item.title || 'Family Photo'}
                        </Text>
                        <Pressable onPress={() => handleDeleteMedia(item.id)}>
                          <Ionicons name="trash-outline" size={15} color="#A23A2A" />
                        </Pressable>
                      </View>
                    </View>
                  ))}

                  {videoList.map(item => (
                    <View key={item.id} style={styles.photoCard}>
                      <View style={styles.videoPlaceholder}>
                        <Ionicons name="play-circle" size={40} color={colors.white} />
                        <Text style={styles.videoBadge}>VIDEO</Text>
                      </View>
                      <View style={styles.photoCaptionBar}>
                        <Text style={styles.photoTitle} numberOfLines={1}>
                          {item.title || 'Video Clip'}
                        </Text>
                        <Pressable onPress={() => handleDeleteMedia(item.id)}>
                          <Ionicons name="trash-outline" size={15} color="#A23A2A" />
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : null}

          {/* TAB 3: VOICE & AUDIO MEMORIES */}
          {activeTab === 'audio' ? (
            <View style={styles.tabContent}>
              {/* Voice Recorder Card */}
              <View style={styles.voiceRecorderCard}>
                <Text style={styles.voiceCardTitle}>RECORD A MEMORY OF {person.name.toUpperCase()}</Text>
                <Text style={styles.voiceCardCopy}>
                  Capture spoken stories, laughter, and recollections. The audio stays preserved in your archive.
                </Text>

                <TextInput
                  value={audioTitle}
                  onChangeText={setAudioTitle}
                  placeholder={`Topic (e.g. ${person.name}'s favorite cooking or advice)`}
                  placeholderTextColor={colors.muted}
                  style={styles.textInput}
                />

                <Pressable
                  onPress={toggleAudioRecord}
                  style={[
                    styles.recordActionBtn,
                    recorderState.isRecording && styles.recordActionBtnActive
                  ]}
                >
                  <Ionicons
                    name={recorderState.isRecording ? 'stop-circle' : 'mic'}
                    size={20}
                    color={colors.white}
                  />
                  <Text style={styles.recordActionBtnText}>
                    {recorderState.isRecording ? `Recording (${recTime}) - Tap to Save` : 'Start Voice Recording'}
                  </Text>
                </Pressable>
              </View>

              {/* Saved Audio List */}
              <Text style={styles.sectionHeader}>PRESERVED VOICE STORIES ({audioList.length})</Text>
              {audioList.length === 0 ? (
                <View style={styles.emptyMedia}>
                  <Ionicons name="mic-outline" size={36} color={colors.muted} />
                  <Text style={styles.emptyMediaCopy}>No voice recordings preserved yet.</Text>
                </View>
              ) : (
                audioList.map(item => (
                  <View key={item.id} style={styles.audioRow}>
                    <View style={styles.audioIconCircle}>
                      <Ionicons name="play" size={18} color={colors.terra} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.audioTitle}>{item.title || 'Oral History Story'}</Text>
                      <Text style={styles.audioDate}>
                        Saved: {new Date(item.createdAt).toLocaleDateString()}
                      </Text>
                    </View>
                    <Pressable onPress={() => handleDeleteMedia(item.id)}>
                      <Ionicons name="trash-outline" size={16} color="#A23A2A" />
                    </Pressable>
                  </View>
                ))
              )}
            </View>
          ) : null}

          {/* TAB 4: IMMEDIATE FAMILY & KIN */}
          {activeTab === 'family' ? (
            <View style={styles.tabContent}>
              {/* Parents */}
              <Text style={styles.sectionHeader}>PARENTS</Text>
              {directKin.parents.length === 0 ? (
                <Text style={styles.emptyKin}>No parents mapped yet.</Text>
              ) : (
                directKin.parents.map(p => (
                  <Pressable
                    key={p.id}
                    onPress={() => onSelectRelative(p)}
                    style={styles.kinRow}
                  >
                    <View style={styles.kinAvatar}>
                      <Text style={styles.kinAvatarText}>{p.name.charAt(0)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.kinName}>{p.name}</Text>
                      <Text style={styles.kinRel}>{p.relationship || 'Parent'}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                  </Pressable>
                ))
              )}

              {/* Spouses */}
              <Text style={styles.sectionHeader}>SPOUSE / PARTNER</Text>
              {directKin.spouses.length === 0 ? (
                <Text style={styles.emptyKin}>No spouse mapped yet.</Text>
              ) : (
                directKin.spouses.map(p => (
                  <Pressable
                    key={p.id}
                    onPress={() => onSelectRelative(p)}
                    style={styles.kinRow}
                  >
                    <View style={[styles.kinAvatar, { backgroundColor: '#FADBD8' }]}>
                      <Text style={styles.kinAvatarText}>{p.name.charAt(0)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.kinName}>{p.name}</Text>
                      <Text style={styles.kinRel}>Spouse / Partner</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                  </Pressable>
                ))
              )}

              {/* Children */}
              <Text style={styles.sectionHeader}>CHILDREN ({directKin.children.length})</Text>
              {directKin.children.length === 0 ? (
                <Text style={styles.emptyKin}>No children mapped yet.</Text>
              ) : (
                directKin.children.map(p => (
                  <Pressable
                    key={p.id}
                    onPress={() => onSelectRelative(p)}
                    style={styles.kinRow}
                  >
                    <View style={[styles.kinAvatar, { backgroundColor: '#D4EFDF' }]}>
                      <Text style={styles.kinAvatarText}>{p.name.charAt(0)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.kinName}>{p.name}</Text>
                      <Text style={styles.kinRel}>{p.relationship || 'Child'}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                  </Pressable>
                ))
              )}

              {/* Siblings */}
              <Text style={styles.sectionHeader}>SIBLINGS ({directKin.siblings.length})</Text>
              {directKin.siblings.length === 0 ? (
                <Text style={styles.emptyKin}>No siblings mapped yet.</Text>
              ) : (
                directKin.siblings.map(p => (
                  <Pressable
                    key={p.id}
                    onPress={() => onSelectRelative(p)}
                    style={styles.kinRow}
                  >
                    <View style={styles.kinAvatar}>
                      <Text style={styles.kinAvatarText}>{p.name.charAt(0)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.kinName}>{p.name}</Text>
                      <Text style={styles.kinRel}>{p.relationship || 'Sibling'}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                  </Pressable>
                ))
              )}
            </View>
          ) : null}

          {/* TAB 5: TIMELINE */}
          {activeTab === 'timeline' ? (
            <View style={styles.tabContent}>
              <View style={styles.timelineHeaderRow}>
                <Text style={styles.sectionHeader}>LIFE TIMELINE & MILESTONES</Text>
                <Pressable
                  onPress={() => setShowAddEvent(!showAddEvent)}
                  style={styles.addEventToggleBtn}
                >
                  <Ionicons name={showAddEvent ? 'close' : 'add'} size={14} color={colors.terra} />
                  <Text style={styles.addEventToggleText}>{showAddEvent ? 'Cancel' : 'Add Milestone'}</Text>
                </Pressable>
              </View>

              {showAddEvent ? (
                <View style={styles.addEventCard}>
                  <Text style={styles.inputLabel}>MILESTONE TITLE *</Text>
                  <TextInput
                    value={newEventTitle}
                    onChangeText={setNewEventTitle}
                    placeholder="e.g. Graduated University, Moved to Mumbai"
                    style={styles.textInput}
                  />

                  <Text style={styles.inputLabel}>EVENT TYPE</Text>
                  <View style={styles.eventTypeOptions}>
                    {[
                      { key: 'birth', label: 'Birth' },
                      { key: 'education', label: 'Education' },
                      { key: 'marriage', label: 'Marriage' },
                      { key: 'career', label: 'Career' },
                      { key: 'migration', label: 'Migration' },
                      { key: 'tradition', label: 'Tradition' },
                      { key: 'life_event', label: 'General' }
                    ].map(t => (
                      <Pressable
                        key={t.key}
                        onPress={() => setNewEventType(t.key)}
                        style={[styles.eventTypeChip, newEventType === t.key && styles.eventTypeChipActive]}
                      >
                        <Text style={[styles.eventTypeChipText, newEventType === t.key && styles.eventTypeChipTextActive]}>
                          {t.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text style={styles.inputLabel}>YEAR OR DATE</Text>
                  <TextInput
                    value={newEventDate}
                    onChangeText={setNewEventDate}
                    placeholder="e.g. 1985 or 12 Oct 1985"
                    style={styles.textInput}
                  />

                  <Text style={styles.inputLabel}>PLACE / LOCATION</Text>
                  <TextInput
                    value={newEventPlace}
                    onChangeText={setNewEventPlace}
                    placeholder="e.g. Mumbai, India"
                    style={styles.textInput}
                  />

                  <Text style={styles.inputLabel}>DESCRIPTION / CONTEXT</Text>
                  <TextInput
                    value={newEventDesc}
                    onChangeText={setNewEventDesc}
                    placeholder="Stories, memories, context..."
                    multiline
                    style={[styles.textInput, { height: 70 }]}
                  />

                  <Pressable onPress={handleAddEvent} style={styles.saveBtn}>
                    <Text style={styles.saveBtnText}>Save Milestone</Text>
                  </Pressable>
                </View>
              ) : null}

              {loadingTimeline ? (
                <ActivityIndicator color={colors.terra} style={{ marginVertical: 20 }} />
              ) : timelineEvents.length === 0 ? (
                <View style={styles.emptyMedia}>
                  <Ionicons name="time-outline" size={36} color={colors.muted} />
                  <Text style={styles.emptyMediaCopy}>
                    No chronological milestones recorded yet. Add births, marriages, migrations, or career milestones.
                  </Text>
                </View>
              ) : (
                <View style={styles.timelineList}>
                  {timelineEvents.map((evt, idx) => (
                    <View key={evt.id} style={styles.timelineItem}>
                      <View style={styles.timelineLeftTrack}>
                        <View style={styles.timelineDot} />
                        {idx < timelineEvents.length - 1 ? <View style={styles.timelineLine} /> : null}
                      </View>
                      <View style={styles.timelineCard}>
                        <View style={styles.timelineCardHeader}>
                          <Text style={styles.timelineDateText}>{evt.eventDate || 'Date not recorded'}</Text>
                          <View style={styles.eventTypeBadge}>
                            <Text style={styles.eventTypeBadgeText}>{evt.eventType.toUpperCase()}</Text>
                          </View>
                        </View>
                        <Text style={styles.timelineItemTitle}>{evt.title}</Text>
                        {evt.place ? (
                          <View style={styles.timelinePlaceRow}>
                            <Ionicons name="location-outline" size={13} color={colors.muted} />
                            <Text style={styles.timelinePlaceText}>{evt.place}</Text>
                          </View>
                        ) : null}
                        {evt.description ? (
                          <Text style={styles.timelineDescText}>{evt.description}</Text>
                        ) : null}
                        {evt.evidence ? (
                          <Text style={styles.timelineEvidenceText}>Source: {evt.evidence}</Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : null}

          {/* TAB 6: EVIDENCE & GROUNDING */}
          {activeTab === 'evidence' ? (
            <View style={styles.tabContent}>
              <Text style={styles.sectionHeader}>GROUNDED EVIDENCE & SOURCES</Text>
              <Text style={styles.evidenceSubtitle}>
                Every fact about {person.name} is backed by family voice transcripts, uploaded documents, or human confirmations.
              </Text>

              {loadingEvidence ? (
                <ActivityIndicator color={colors.terra} style={{ marginVertical: 20 }} />
              ) : evidenceItems.length === 0 ? (
                <View style={styles.emptyMedia}>
                  <Ionicons name="shield-checkmark-outline" size={36} color={colors.muted} />
                  <Text style={styles.emptyMediaCopy}>
                    Direct profile edits created this record. Record a memory or upload a document to attach verifiable voice evidence.
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 12 }}>
                  {evidenceItems.map(item => (
                    <View key={item.id} style={styles.evidenceCard}>
                      <View style={styles.evidenceCardTop}>
                        <View style={styles.factTypeBadge}>
                          <Text style={styles.factTypeBadgeText}>{item.factType.replace(/_/g, ' ').toUpperCase()}</Text>
                        </View>
                        <Text style={styles.confidenceText}>
                          {Math.round(item.confidence * 100)}% Confidence
                        </Text>
                      </View>
                      {item.sourceExcerpt ? (
                        <View style={styles.quoteBox}>
                          <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.terra} style={{ opacity: 0.7 }} />
                          <Text style={styles.quoteText}>"{item.sourceExcerpt}"</Text>
                        </View>
                      ) : null}
                      <View style={styles.evidenceFooter}>
                        <Text style={styles.sourceTypeText}>Source: {item.sourceType}</Text>
                        <Text style={styles.evidenceDateText}>{new Date(item.createdAt).toLocaleDateString()}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : null}

          {/* Delete Action */}
          <View style={styles.deleteSection}>
            <Pressable
              onPress={() => onDeletePerson(person.id)}
              style={styles.deletePersonBtn}
            >
              <Ionicons name="trash-outline" size={16} color="#A23A2A" />
              <Text style={styles.deletePersonBtnText}>Delete {person.name} from Tree</Text>
            </Pressable>
          </View>
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
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card
  },
  iconBtn: { padding: 4 },
  topBarTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  editToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.surfaceWarm
  },
  editToggleText: { color: colors.terra, fontWeight: '800', fontSize: 12 },
  scroll: { paddingBottom: 40 },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 10,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  dpWrapper: {
    position: 'relative'
  },
  dpImage: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 3,
    borderColor: colors.terra
  },
  dpPlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.border
  },
  dpFemale: { backgroundColor: '#FADBD8' },
  dpMale: { backgroundColor: '#D4E6F1' },
  dpInitial: { fontSize: 36, fontWeight: '900', color: colors.ink },
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.terra,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white
  },
  profileName: { fontSize: 22, fontWeight: '800', color: colors.ink, marginTop: 4 },
  badgesRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  relationTag: {
    backgroundColor: colors.surfaceWarm,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6
  },
  relationTagText: { color: colors.terra, fontSize: 11, fontWeight: '800' },
  genderTag: {
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  genderTagText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  metaTag: {
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  metaTagText: { color: colors.muted, fontSize: 11 },
  tabsScroll: {
    maxHeight: 50,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    paddingHorizontal: 8
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent'
  },
  tabBtnActive: {
    borderBottomColor: colors.terra
  },
  tabText: { fontSize: 12, fontWeight: '700', color: colors.muted },
  tabTextActive: { color: colors.terra },
  tabContent: { padding: 16, gap: 14 },
  timelineHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  addEventToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceWarm,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999
  },
  addEventToggleText: { fontSize: 11, fontWeight: '800', color: colors.terra },
  addEventCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border
  },
  eventTypeOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: 4
  },
  eventTypeChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.surfaceWarm,
    borderWidth: 1,
    borderColor: colors.border
  },
  eventTypeChipActive: {
    backgroundColor: colors.terra,
    borderColor: colors.terra
  },
  eventTypeChipText: { fontSize: 11, fontWeight: '700', color: colors.ink },
  eventTypeChipTextActive: { color: colors.white },
  timelineList: {
    gap: 0,
    paddingVertical: 6
  },
  timelineItem: {
    flexDirection: 'row',
    gap: 12
  },
  timelineLeftTrack: {
    alignItems: 'center',
    width: 20
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.terra,
    marginTop: 4
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: colors.border,
    marginVertical: 4
  },
  timelineCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
    gap: 4
  },
  timelineCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  timelineDateText: { fontSize: 11, fontWeight: '800', color: colors.terra },
  eventTypeBadge: {
    backgroundColor: colors.surfaceWarm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  eventTypeBadgeText: { fontSize: 9, fontWeight: '800', color: colors.muted },
  timelineItemTitle: { fontSize: 13, fontWeight: '800', color: colors.ink },
  timelinePlaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  timelinePlaceText: { fontSize: 11, color: colors.muted },
  timelineDescText: { fontSize: 12, color: colors.ink, lineHeight: 18, marginTop: 2 },
  timelineEvidenceText: { fontSize: 10, color: colors.muted, fontStyle: 'italic', marginTop: 2 },
  evidenceSubtitle: { fontSize: 12, color: colors.muted, lineHeight: 18 },
  evidenceCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8
  },
  evidenceCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  factTypeBadge: {
    backgroundColor: colors.surfaceWarm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4
  },
  factTypeBadgeText: { fontSize: 10, fontWeight: '800', color: colors.terra },
  confidenceText: { fontSize: 10, fontWeight: '800', color: '#1B5E20' },
  quoteBox: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: colors.surfaceWarm,
    borderRadius: 6,
    padding: 8
  },
  quoteText: { flex: 1, fontSize: 11, color: colors.ink, fontStyle: 'italic', lineHeight: 16 },
  evidenceFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2
  },
  sourceTypeText: { fontSize: 10, color: colors.muted },
  evidenceDateText: { fontSize: 10, color: colors.muted },
  detailsCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    gap: 16,
    borderWidth: 1,
    borderColor: colors.border
  },
  detailRow: { flexDirection: 'row', gap: 12 },
  detailLabel: { fontSize: 10, fontWeight: '800', color: colors.muted, letterSpacing: 1.1 },
  detailValue: { fontSize: 14, color: colors.ink, lineHeight: 20, marginTop: 2 },
  editCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border
  },
  inputLabel: { fontSize: 10, fontWeight: '800', color: colors.muted, letterSpacing: 1.1, marginTop: 4 },
  textInput: {
    backgroundColor: colors.surfaceWarm,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    fontSize: 13,
    borderWidth: 1,
    borderColor: colors.border
  },
  genderOptions: { flexDirection: 'row', gap: 8 },
  genderChoice: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceWarm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border
  },
  genderChoiceActive: { backgroundColor: colors.terra, borderColor: colors.terra },
  genderChoiceText: { fontSize: 11, fontWeight: '700', color: colors.ink },
  genderChoiceTextActive: { color: colors.white },
  saveBtn: {
    backgroundColor: colors.terra,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8
  },
  saveBtnText: { color: colors.white, fontSize: 13, fontWeight: '800' },
  mediaActionBar: { flexDirection: 'row', gap: 10 },
  addMediaBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.terra,
    borderRadius: radius.md,
    paddingVertical: 11
  },
  addMediaBtnText: { color: colors.white, fontWeight: '800', fontSize: 12 },
  addMediaSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceWarm,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: colors.border
  },
  addMediaSecondaryBtnText: { color: colors.terra, fontWeight: '800', fontSize: 12 },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12
  },
  photoCard: {
    width: '48%',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border
  },
  gridImage: { width: '100%', height: 130 },
  videoPlaceholder: {
    width: '100%',
    height: 130,
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center'
  },
  videoBadge: { color: colors.white, fontSize: 10, fontWeight: '800', marginTop: 4 },
  photoCaptionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 8
  },
  photoTitle: { fontSize: 11, color: colors.ink, fontWeight: '700', flex: 1 },
  emptyMedia: { alignItems: 'center', padding: 30, gap: 8 },
  emptyMediaTitle: { fontSize: 15, fontWeight: '800', color: colors.ink },
  emptyMediaCopy: { fontSize: 12, color: colors.muted, textAlign: 'center', lineHeight: 17 },
  voiceRecorderCard: {
    backgroundColor: colors.surfaceWarm,
    borderRadius: radius.lg,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: '#EBDCCE'
  },
  voiceCardTitle: { fontSize: 11, fontWeight: '800', color: colors.terra, letterSpacing: 1.1 },
  voiceCardCopy: { fontSize: 12, color: colors.muted, lineHeight: 17 },
  recordActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.terra,
    borderRadius: radius.md,
    paddingVertical: 12
  },
  recordActionBtnActive: { backgroundColor: '#D93829' },
  recordActionBtnText: { color: colors.white, fontWeight: '800', fontSize: 13 },
  sectionHeader: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.muted,
    letterSpacing: 1.2,
    marginTop: 10
  },
  audioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border
  },
  audioIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center'
  },
  audioTitle: { fontSize: 13, fontWeight: '800', color: colors.ink },
  audioDate: { fontSize: 11, color: colors.muted },
  emptyKin: { fontSize: 12, color: colors.muted, fontStyle: 'italic', paddingVertical: 4 },
  kinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border
  },
  kinAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center'
  },
  kinAvatarText: { fontSize: 14, fontWeight: '800', color: colors.ink },
  kinName: { fontSize: 13, fontWeight: '800', color: colors.ink },
  kinRel: { fontSize: 11, color: colors.muted },
  deleteSection: {
    paddingHorizontal: 16,
    marginTop: 20
  },
  deletePersonBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: '#FDEAE8'
  },
  deletePersonBtnText: { color: '#A23A2A', fontWeight: '800', fontSize: 13 }
});

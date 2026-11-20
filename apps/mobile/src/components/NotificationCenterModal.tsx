import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors, radius } from '../theme';
import {
  listNotificationsClient,
  markAllNotificationsReadClient,
  markNotificationReadClient
} from '../lib/sync-client';

interface NotificationCenterModalProps {
  visible: boolean;
  onClose: () => void;
  onBadgeUpdated?: (unreadCount: number) => void;
}

export interface DisplayNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  linkUrl?: string | null;
  read: boolean;
  createdAt: string;
}

export function NotificationCenterModal({
  visible,
  onClose,
  onBadgeUpdated
}: NotificationCenterModalProps) {
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState<DisplayNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const res = await listNotificationsClient();
      setNotifications(res.notifications || []);
      setUnreadCount(res.unreadCount || 0);
      onBadgeUpdated?.(res.unreadCount || 0);
    } catch (e) {
      console.warn('Failed to fetch notifications', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      fetchNotifications();
    }
  }, [visible]);

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsReadClient();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
      onBadgeUpdated?.(0);
    } catch (e) {
      console.warn('Failed to mark all read', e);
    }
  };

  const handleNotificationPress = async (item: DisplayNotification) => {
    try {
      if (!item.read) {
        await markNotificationReadClient(item.id);
        setNotifications(prev =>
          prev.map(n => (n.id === item.id ? { ...n, read: true } : n))
        );
        const newUnread = Math.max(0, unreadCount - 1);
        setUnreadCount(newUnread);
        onBadgeUpdated?.(newUnread);
      }

      onClose();

      // Smart routing
      if (item.linkUrl) {
        if (item.linkUrl.startsWith('/')) {
          router.push(item.linkUrl as any);
          return;
        }
      }

      if (item.type.includes('invite') || item.type.includes('member')) {
        router.push('/family-share');
      } else if (item.type.includes('comment') || item.type.includes('reaction') || item.type.includes('story')) {
        router.push('/(tabs)/stories');
      } else if (item.type.includes('suggestion')) {
        router.push('/review-suggestions');
      } else if (item.type.includes('agent')) {
        router.push('/tree-builder');
      }
    } catch (e) {
      console.warn('Error handling notification press', e);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'invite_received':
      case 'invite_accepted':
      case 'member_joined':
        return { name: 'people' as const, color: '#3A86FF', bg: '#EBF2FF' };
      case 'comment_added':
        return { name: 'chatbubble-ellipses' as const, color: '#FF006E', bg: '#FFEBF3' };
      case 'reaction_added':
        return { name: 'heart' as const, color: colors.terra, bg: '#FDF0EC' };
      case 'suggestion_pending':
      case 'suggestion_approved':
        return { name: 'shield-checkmark' as const, color: '#38B000', bg: '#EBF9EB' };
      case 'agent_action':
        return { name: 'sparkles' as const, color: '#8338EC', bg: '#F4ECFB' };
      default:
        return { name: 'notifications' as const, color: colors.terra, bg: '#FDF0EC' };
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={styles.headerIcon}>
                <Ionicons name="notifications" size={18} color={colors.terra} />
              </View>
              <View>
                <Text style={styles.title}>Notifications</Text>
                <Text style={styles.subtitle}>
                  {unreadCount > 0 ? `${unreadCount} new family updates` : 'You are all caught up'}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {unreadCount > 0 ? (
                <Pressable onPress={handleMarkAllRead} style={styles.markAllBtn}>
                  <Text style={styles.markAllText}>Mark all read</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={colors.ink} />
              </Pressable>
            </View>
          </View>

          {/* Body */}
          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={colors.terra} />
              <Text style={styles.loadingText}>Loading notifications...</Text>
            </View>
          ) : notifications.length === 0 ? (
            <View style={styles.emptyBox}>
              <View style={styles.emptyCircle}>
                <Ionicons name="checkmark-done" size={32} color={colors.muted} />
              </View>
              <Text style={styles.emptyTitle}>All caught up!</Text>
              <Text style={styles.emptyCopy}>
                When relatives share stories, add memories, accept invitations, or react, you'll see them right here.
              </Text>
            </View>
          ) : (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.listContent}>
              {notifications.map(item => {
                const icon = getIcon(item.type);
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => handleNotificationPress(item)}
                    style={[styles.itemCard, !item.read && styles.itemCardUnread]}
                  >
                    <View style={[styles.itemIcon, { backgroundColor: icon.bg }]}>
                      <Ionicons name={icon.name} size={18} color={icon.color} />
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={[styles.itemTitle, !item.read && styles.itemTitleBold]}>
                          {item.title}
                        </Text>
                        {!item.read ? <View style={styles.unreadDot} /> : null}
                      </View>
                      <Text style={styles.itemBody} numberOfLines={2}>
                        {item.body}
                      </Text>
                      <Text style={styles.itemTime}>
                        {new Date(item.createdAt).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end'
  },
  container: {
    height: '75%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: 16,
    paddingHorizontal: 18,
    paddingBottom: 24
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
  markAllBtn: {
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceWarm
  },
  markAllText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.terra
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center'
  },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  loadingText: {
    fontSize: 12,
    color: colors.muted
  },
  emptyBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10
  },
  emptyCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink
  },
  emptyCopy: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 18
  },
  listContent: {
    paddingTop: 12,
    paddingBottom: 30,
    gap: 10
  },
  itemCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border
  },
  itemCardUnread: {
    backgroundColor: '#FFFDF9',
    borderColor: '#E6D7C8'
  },
  itemIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  itemTitle: {
    fontSize: 13,
    color: colors.ink,
    fontWeight: '600'
  },
  itemTitleBold: {
    fontWeight: '800',
    color: colors.ink
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.terra
  },
  itemBody: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 16
  },
  itemTime: {
    fontSize: 10,
    color: '#A0988E',
    marginTop: 2
  }
});


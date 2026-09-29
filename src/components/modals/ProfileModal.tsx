import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { COLORS } from '../../constants/theme';
import { NativeEffectsService } from '../../services/NativeEffects';
import { PlayerIdentityService, UserProfile } from '../../services/PlayerIdentityService';

interface ProfileModalProps {
  visible: boolean;
  onClose: () => void;
}

const AVATAR_OPTIONS = [
  '👦🏻', '👩🏼', '🧔🏻‍♂️', '👧🏻', '🐯', '🐼', '🦊', '👑', '🎮', '⭐', '🔥', '🎯', '🚀', '💎', '🌟', '🎲'
];

export const ProfileModal: React.FC<ProfileModalProps> = ({ visible, onClose }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [nameInput, setNameInput] = useState<string>('');
  const [selectedAvatar, setSelectedAvatar] = useState<string>('👦🏻');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      PlayerIdentityService.getProfile().then(p => {
        setProfile(p);
        setNameInput(p.displayName);
        setSelectedAvatar(p.avatar);
      });
    }
  }, [visible]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  const handleSave = async () => {
    if (!nameInput.trim()) {
      showToast('Name cannot be empty');
      return;
    }
    setIsSaving(true);
    NativeEffectsService.triggerCardSelect();
    try {
      const updated = await PlayerIdentityService.updateProfile({
        displayName: nameInput.trim(),
        avatar: selectedAvatar,
      });
      setProfile(updated);
      showToast('Profile updated successfully!');
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (_) {
      showToast('Failed to save profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    NativeEffectsService.triggerCardSelect();
    const res = await PlayerIdentityService.signInWithGoogle();
    setIsSigningIn(false);
    if (res.error) {
      showToast(res.error);
    } else {
      showToast('Signed in with Google!');
      const p = await PlayerIdentityService.getProfile();
      setProfile(p);
      setNameInput(p.displayName);
      setSelectedAvatar(p.avatar);
    }
  };

  const handleSignOut = async () => {
    NativeEffectsService.triggerCardSelect();
    await PlayerIdentityService.signOut();
    const p = await PlayerIdentityService.getProfile();
    setProfile(p);
    setNameInput(p.displayName);
    setSelectedAvatar(p.avatar);
    showToast('Signed out to Guest Mode');
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>PROFILE</Text>
            <Pressable
              onPress={() => {
                NativeEffectsService.triggerCardSelect();
                onClose();
              }}
              style={styles.closeBtn}
            >
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>

          {/* Account Status Badge */}
          <View style={styles.statusBadge}>
            <View style={[styles.statusDot, { backgroundColor: profile?.isGuest ? COLORS.unoYellow : COLORS.unoGreen }]} />
            <Text style={styles.statusText}>
              {profile?.isGuest ? 'Guest Account' : `Signed in with Google (${profile?.email || 'Connected'})`}
            </Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            {/* Current Avatar Circle */}
            <View style={styles.avatarPreviewSection}>
              <View style={styles.largeAvatarCircle}>
                <Text style={styles.largeAvatarEmoji}>{selectedAvatar}</Text>
              </View>
              <Text style={styles.avatarSubtext}>Tap an avatar below to change</Text>
            </View>

            {/* Display Name Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>DISPLAY NAME</Text>
              <TextInput
                style={styles.textInput}
                value={nameInput}
                onChangeText={setNameInput}
                placeholder="Enter player name"
                placeholderTextColor="#64748B"
                maxLength={24}
                autoCorrect={false}
              />
            </View>

            {/* Avatar Selector Grid */}
            <View style={styles.avatarGroup}>
              <Text style={styles.inputLabel}>CHOOSE AVATAR</Text>
              <View style={styles.avatarGrid}>
                {AVATAR_OPTIONS.map(av => {
                  const isSelected = av === selectedAvatar;
                  return (
                    <Pressable
                      key={av}
                      style={[styles.avatarOption, isSelected && styles.avatarOptionSelected]}
                      onPress={() => {
                        NativeEffectsService.triggerCardSelect();
                        setSelectedAvatar(av);
                      }}
                    >
                      <Text style={styles.avatarOptionEmoji}>{av}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Google Login / Sign Out Action */}
            <View style={styles.accountActionBox}>
              {profile?.isGuest ? (
                <>
                  <Pressable
                    style={[styles.googleSignInBtn, isSigningIn && styles.btnDisabled]}
                    disabled={isSigningIn}
                    onPress={handleGoogleSignIn}
                  >
                    {isSigningIn ? (
                      <ActivityIndicator color="#000" />
                    ) : (
                      <>
                        <Text style={styles.googleIcon}>G</Text>
                        <Text style={styles.googleSignInText}>Sign in with Google</Text>
                      </>
                    )}
                  </Pressable>
                  <Text style={styles.authNoticeText}>
                    Guest accounts save locally and support all game modes. Google login requires Google Provider enabled in your Supabase project.
                  </Text>
                </>
              ) : (
                <Pressable style={styles.signOutBtn} onPress={handleSignOut}>
                  <Text style={styles.signOutText}>Sign Out of Google</Text>
                </Pressable>
              )}
            </View>

            {toastMsg && (
              <View style={styles.toastBox}>
                <Text style={styles.toastText}>{toastMsg}</Text>
              </View>
            )}
          </ScrollView>

          {/* Save Button */}
          <Pressable
            style={[styles.saveBtn, isSaving && styles.btnDisabled]}
            disabled={isSaving}
            onPress={handleSave}
          >
            {isSaving ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.saveBtnText}>SAVE PROFILE</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '90%',
    backgroundColor: '#0F172A',
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 16,
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  content: {
    gap: 16,
    paddingBottom: 16,
  },
  avatarPreviewSection: {
    alignItems: 'center',
    gap: 6,
  },
  largeAvatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1E293B',
    borderWidth: 3,
    borderColor: COLORS.goldGlow,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.goldGlow,
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  largeAvatarEmoji: {
    fontSize: 42,
  },
  avatarSubtext: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '500',
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  textInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  avatarGroup: {
    gap: 8,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  avatarOption: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOptionSelected: {
    borderColor: COLORS.emeraldGlow,
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    transform: [{ scale: 1.1 }],
  },
  avatarOptionEmoji: {
    fontSize: 22,
  },
  accountActionBox: {
    marginTop: 8,
  },
  googleSignInBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 10,
  },
  googleIcon: {
    fontSize: 16,
    fontWeight: '900',
    color: '#4285F4',
  },
  googleSignInText: {
    color: '#0F172A',
    fontWeight: '800',
    fontSize: 14,
  },
  authNoticeText: {
    color: '#94A3B8',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 15,
  },
  signOutBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 10,
  },
  signOutText: {
    color: '#EF4444',
    fontWeight: '700',
    fontSize: 13,
  },
  toastBox: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    borderColor: COLORS.unoGreen,
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
    alignItems: 'center',
  },
  toastText: {
    color: '#4ADE80',
    fontSize: 12,
    fontWeight: '700',
  },
  saveBtn: {
    backgroundColor: COLORS.unoGreen,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
    shadowColor: COLORS.unoGreen,
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 16,
    letterSpacing: 1,
  },
  btnDisabled: {
    opacity: 0.6,
  },
});

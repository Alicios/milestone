import { useThemedStyles } from './AppTheme';
import React, { useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import Text from './AppText';

export default function ProfileAvatar({ profile, size = 44, onPress }) {
  const button = useRef(null);
  const styles = useThemedStyles(baseStyles);
  const [failedPhoto, setFailedPhoto] = useState(null);
  const name = profile?.preferredName || profile?.fullName?.split(' ')[0] || 'Frank';
  const photoUri = profile?.photoUri;
  const Container = onPress ? Pressable : View;
  return (
    <Container ref={button} accessibilityRole={onPress ? 'button' : 'image'} accessibilityLabel={onPress ? 'Open profile and settings' : `${name}'s profile`} accessibilityHint={onPress ? `${name}'s account` : undefined} onPress={onPress ? () => onPress(button.current) : undefined} style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      {photoUri && failedPhoto !== photoUri ? (
        <Image key={photoUri} accessible={false} source={{ uri: photoUri }} resizeMode="cover" onError={() => setFailedPhoto(photoUri)} style={styles.photo} />
      ) : <Text style={[styles.initial, { fontSize: size * 0.48 }]}>{name.charAt(0).toUpperCase()}</Text>}
    </Container>
  );
}

const baseStyles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#E9611C', borderColor: '#193333', borderWidth: 1.5, overflow: 'hidden' },
  photo: { width: '100%', height: '100%' },
  initial: { color: '#FFFDF7', fontWeight: '800' },
});

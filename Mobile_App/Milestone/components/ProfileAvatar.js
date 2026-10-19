import React, { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Text from './AppText';

export default function ProfileAvatar({ profile, size = 44 }) {
  const [failedPhoto, setFailedPhoto] = useState(null);
  const name = profile?.preferredName || profile?.fullName?.split(' ')[0] || 'Frank';
  const photoUri = profile?.photoUri;
  return (
    <View accessibilityRole="image" accessibilityLabel={`${name}'s profile`} style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      {photoUri && failedPhoto !== photoUri ? (
        <Image key={photoUri} accessible={false} source={{ uri: photoUri }} resizeMode="cover" onError={() => setFailedPhoto(photoUri)} style={styles.photo} />
      ) : <Text style={[styles.initial, { fontSize: size * 0.48 }]}>{name.charAt(0).toUpperCase()}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#E9611C', borderColor: '#193333', borderWidth: 1.5, overflow: 'hidden' },
  photo: { width: '100%', height: '100%' },
  initial: { color: '#FFFDF7', fontWeight: '800' },
});

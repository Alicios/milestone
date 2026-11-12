import React from 'react';
import { router } from 'expo-router';
import { Button, Empty, Screen } from '../src/ui/components';
export default function NotFound() { return <Screen><Empty title="Page unavailable" detail="Return to your patient workspace to continue." /><Button title="Go to patients" onPress={() => router.replace('/patients')} /></Screen>; }

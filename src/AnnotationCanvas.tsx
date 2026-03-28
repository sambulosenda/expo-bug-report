import React, { useState, useCallback, useRef } from 'react';
import { View, Image, TouchableOpacity, Text } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import {
  GestureDetector,
  Gesture,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { captureRef } from 'react-native-view-shot';

interface AnnotationCanvasProps {
  screenshotUri: string;
  onAnnotationComplete: (annotatedUri: string) => void;
  onSkip: () => void;
  width: number;
  height: number;
}

interface PathData {
  d: string;
}

export function AnnotationCanvas({
  screenshotUri,
  onAnnotationComplete,
  onSkip,
  width,
  height,
}: AnnotationCanvasProps) {
  const [paths, setPaths] = useState<PathData[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const compositeRef = useRef<View>(null);
  const [isSaving, setIsSaving] = useState(false);

  const panGesture = Gesture.Pan()
    .onStart((event) => {
      setCurrentPath(`M${event.x},${event.y}`);
    })
    .onUpdate((event) => {
      setCurrentPath((prev) => `${prev} L${event.x},${event.y}`);
    })
    .onEnd(() => {
      if (currentPath) {
        setPaths((prev) => [...prev, { d: currentPath }]);
        setCurrentPath('');
      }
    })
    .minDistance(0);

  const handleUndo = useCallback(() => {
    setPaths((prev) => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    setPaths([]);
  }, []);

  const handleDone = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const uri = await captureRef(compositeRef, {
        format: 'png',
        quality: 0.9,
        result: 'tmpfile',
      });
      onAnnotationComplete(uri);
    } catch {
      onSkip();
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, onAnnotationComplete, onSkip]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <View
          ref={compositeRef}
          collapsable={false}
          style={{ width, height, position: 'relative' }}
        >
          <Image
            source={{ uri: screenshotUri }}
            style={{ width, height }}
            resizeMode="contain"
          />
          <GestureDetector gesture={panGesture}>
            <Svg
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width,
                height,
              }}
            >
              {paths.map((path, index) => (
                <Path
                  key={index}
                  d={path.d}
                  stroke="#FF3B30"
                  strokeWidth={3}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              {currentPath ? (
                <Path
                  d={currentPath}
                  stroke="#FF3B30"
                  strokeWidth={3}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
            </Svg>
          </GestureDetector>
        </View>

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingVertical: 12,
          }}
        >
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity
              onPress={handleUndo}
              disabled={paths.length === 0}
              accessibilityRole="button"
              accessibilityLabel="Undo last drawing"
            >
              <Text
                style={{
                  fontSize: 16,
                  color: paths.length === 0 ? '#ccc' : '#007AFF',
                }}
              >
                Undo
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleClear}
              disabled={paths.length === 0}
              accessibilityRole="button"
              accessibilityLabel="Clear all drawings"
            >
              <Text
                style={{
                  fontSize: 16,
                  color: paths.length === 0 ? '#ccc' : '#FF3B30',
                }}
              >
                Clear
              </Text>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity
              onPress={onSkip}
              accessibilityRole="button"
              accessibilityLabel="Skip annotation"
            >
              <Text style={{ fontSize: 16, color: '#8E8E93' }}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleDone}
              disabled={isSaving}
              accessibilityRole="button"
              accessibilityLabel="Done annotating"
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: isSaving ? '#ccc' : '#007AFF',
                }}
              >
                Done
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </GestureHandlerRootView>
  );
}

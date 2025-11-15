import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type DeviceRole = 'main' | 'rear';
type CarId = 'car1' | 'car2';

interface DeviceConfigModalProps {
  visible: boolean;
  onClose: () => void;
  onConfigure: (carId: CarId, role: DeviceRole) => void;
  currentCarId: CarId;
  currentRole: DeviceRole;
}

export function DeviceConfigModal({
  visible,
  onClose,
  onConfigure,
  currentCarId,
  currentRole
}: DeviceConfigModalProps) {
  const [selectedCar, setSelectedCar] = useState<CarId>(currentCarId);
  const [selectedRole, setSelectedRole] = useState<DeviceRole>(currentRole);

  const handleSave = () => {
    onConfigure(selectedCar, selectedRole);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>Device Configuration</Text>
          <Text style={styles.subtitle}>Configure this iPad's role in the convoy</Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Car Number</Text>
            <View style={styles.optionGroup}>
              <TouchableOpacity
                style={[styles.option, selectedCar === 'car1' && styles.optionSelected]}
                onPress={() => setSelectedCar('car1')}
              >
                <Ionicons
                  name="car-sport"
                  size={32}
                  color={selectedCar === 'car1' ? '#2563eb' : '#666'}
                />
                <Text style={[styles.optionText, selectedCar === 'car1' && styles.optionTextSelected]}>
                  Car 1
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.option, selectedCar === 'car2' && styles.optionSelected]}
                onPress={() => setSelectedCar('car2')}
              >
                <Ionicons
                  name="car-sport"
                  size={32}
                  color={selectedCar === 'car2' ? '#2563eb' : '#666'}
                />
                <Text style={[styles.optionText, selectedCar === 'car2' && styles.optionTextSelected]}>
                  Car 2
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Display Type</Text>
            <View style={styles.optionGroup}>
              <TouchableOpacity
                style={[styles.option, selectedRole === 'main' && styles.optionSelected]}
                onPress={() => setSelectedRole('main')}
              >
                <Ionicons
                  name="speedometer"
                  size={32}
                  color={selectedRole === 'main' ? '#2563eb' : '#666'}
                />
                <Text style={[styles.optionText, selectedRole === 'main' && styles.optionTextSelected]}>
                  Main Display
                </Text>
                <Text style={styles.optionDescription}>Front dashboard</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.option, selectedRole === 'rear' && styles.optionSelected]}
                onPress={() => setSelectedRole('rear')}
              >
                <Ionicons
                  name="tv"
                  size={32}
                  color={selectedRole === 'rear' ? '#2563eb' : '#666'}
                />
                <Text style={[styles.optionText, selectedRole === 'rear' && styles.optionTextSelected]}>
                  Rear Display
                </Text>
                <Text style={styles.optionDescription}>Back seat passengers</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Save & Connect</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    width: '40%',
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 32,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 16,
  },
  optionGroup: {
    flexDirection: 'row',
    gap: 16,
  },
  option: {
    flex: 1,
    padding: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    backgroundColor: 'white',
  },
  optionSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  optionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginTop: 12,
  },
  optionTextSelected: {
    color: '#2563eb',
  },
  optionDescription: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  cancelButton: {
    flex: 1,
    padding: 16,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
  },
  saveButton: {
    flex: 2,
    padding: 16,
    borderRadius: 10,
    backgroundColor: '#2563eb',
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});

import { PathArtifact, ActivityType } from '../types';

// Map internal activity types to YAML task names
const activityTypeToTaskName = (type: ActivityType): string => {
  const mapping: Record<ActivityType, string> = {
    'DTE_COMMS': 'TTC_COMMS',
    'LPF_COMMS': 'PL_COMMS',
    'SCIENCE': 'Science',
    'IDLE': 'Idle',
    'SLEEP': 'Sleep',
    'DRIVE-0': 'Drive-0',
    'DRIVE-5': 'Drive-5',
    'DRIVE-10': 'Drive-10',
    'DRIVE-15': 'Drive-15',
  };
  return mapping[type] || type;
};

// Determine which drive speed to use for the traverse task
// Uses the last DRIVE activity in the waypoint, or defaults to DRIVE-5
const getDriveSpeed = (waypoint: PathArtifact['waypoints'][0]): string => {
  if (!waypoint.activities || waypoint.activities.length === 0) {
    return '5';
  }

  // Look for the last DRIVE activity
  for (let i = waypoint.activities.length - 1; i >= 0; i--) {
    const activity = waypoint.activities[i];
    if (activity.type.startsWith('DRIVE-')) {
      return activity.type.replace('DRIVE-', '');
    }
  }

  return '5'; // Default to DRIVE-5
};

export const exportPathToYAML = (path: PathArtifact): void => {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  const timeStr = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  let yaml = `# creation date: ${dateStr}, ${timeStr}\n\n`;

  path.waypoints.forEach((waypoint, index) => {
    const waypointId = index + 1;
    const [lon, lat] = waypoint.geoPosition;

    // Start building the waypoint entry
    yaml += `- ID: ${waypointId}\n`;
    yaml += `  latitude_degrees: ${lat.toFixed(5)}\n`;
    yaml += `  longitude_degrees: ${lon.toFixed(5)}\n`;
    yaml += `  tasks:\n`;

    const tasks: string[] = [];
    const durations: number[] = [];

    // First waypoint gets "Start" task
    if (index === 0) {
      tasks.push('Start');
      // Start doesn't add a duration (or we could add 0)
      // Looking at the example, first waypoint only has one duration [0]
      // So Start might not have a separate duration
    }

    // Add all activities from the waypoint
    if (waypoint.activities && waypoint.activities.length > 0) {
      waypoint.activities.forEach(activity => {
        // Skip DRIVE activities as they're handled differently
        if (!activity.type.startsWith('DRIVE-')) {
          tasks.push(activityTypeToTaskName(activity.type));
          durations.push(activity.duration);
        }
      });
    }

    // Add Drive-X_Traverse_Y task (except for the last waypoint)
    if (index < path.waypoints.length - 1) {
      const driveSpeed = getDriveSpeed(waypoint);
      const traverseNum = index + 2; // Traverse numbering starts at 2
      tasks.push(`Drive-${driveSpeed}_Traverse_${traverseNum}`);
      durations.push(0);
    }

    // Write tasks
    tasks.forEach(task => {
      yaml += `    - ${task}\n`;
    });

    // Write durations
    yaml += `  duration_s:\n`;
    durations.forEach(duration => {
      yaml += `    - ${duration}\n`;
    });

    // Don't add extra newline after last waypoint
    if (index < path.waypoints.length - 1) {
      yaml += '\n';
    }
  });

  // Create and download the file
  const blob = new Blob([yaml], { type: 'text/yaml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${path.name.replace(/\s+/g, '_')}_${now.toISOString().split('T')[0]}.yaml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

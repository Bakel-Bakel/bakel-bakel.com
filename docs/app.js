(function () {
  "use strict";

  /** @type {{ projects: Array<object>, categoryDefault?: string }} */
  let data = { projects: [] };
  /** @type {string | null} active filter: null, "skillset:…", "group:…", or ungrouped skill key */
  let activeSkill = null;
  /** @type {string | null} which coarse skill area is expanded to show member buttons */
  let expandedSkillsetId = null;
  /** @type {string} portfolio tab id (includes education) */
  let activeSectionId = "work-experience";
  /** @type {Map<string, string>} chip key → display label */
  let skillKeyToLabel = new Map();

  const GROUP_PREFIX = "group:";

  const PORTFOLIO_SECTIONS = [
    { id: "work-experience", label: "Work Experience" },
    { id: "contracts", label: "Contracts" },
    { id: "research-experience", label: "Research Experience" },
    { id: "education", label: "Education" },
    { id: "projects", label: "Projects" },
    { id: "competitions", label: "Competitions" },
    { id: "awards", label: "Awards" },
  ];
  const PORTFOLIO_CATEGORY_IDS = new Set(PORTFOLIO_SECTIONS.map((s) => s.id));
  /** JSON `category` values accepted besides portfolio tabs (e.g. papers listed under Research Experience). */
  const JSON_CATEGORY_IDS = new Set([...PORTFOLIO_CATEGORY_IDS, "papers"]);

  /** Curated filter: not derived from write-up skill tables (see projects.json `id`). */
  const NVIDIA_JETSON_DEVELOPER_GROUP = "nvidia-jetson-developer";
  const NVIDIA_JETSON_DEVELOPER_LABEL = "NVIDIA Jetson Developer";
  const NVIDIA_JETSON_DEVELOPER_PROJECT_IDS = new Set([
    "Intelligent Shield/Intelligent Shield Proposal.docx",
    "Yahboom ROSMASTER A1 Client/Yahboom ROSMASTER A1 Client.docx",
    "Erasmus Thesis_ Underwater Pipe Detection/Erasmus Thesis_ Underwater Pipe Detection.docx",
    "Teleprance Telepresence System/Teleprance Telepresence System.docx",
  ]);

  /**
   * Major industrial / collaborative robot OEMs and UR cobot model patterns.
   * @param {string} raw
   * @returns {boolean}
   */
  function matchesIndustrialRobotBrand(raw) {
    if (
      /\b(?:abb|fanuc|kuka|yaskawa|franka|kinova|staubli|stäubli|denso|nachi|comau|kawasaki|mitsubishi|jaka|omron|doosan|hanwha|epson)\b/i.test(
        raw,
      )
    ) {
      return true;
    }
    if (/\buniversal\s+robots?\b/i.test(raw)) return true;
    if (/\bur(?:3|5|10|12|16|20)e?\b/i.test(raw)) return true;
    if (/techman|\btm\s+robot\b/i.test(raw)) return true;
    if (/\b(?:rethink|baxter|sawyer)\b/i.test(raw)) return true;
    return false;
  }

  /**
   * Typical embedded peripherals / interfaces (displays, buses, actuators, on-chip blocks).
   * @param {string} raw
   * @returns {boolean}
   */
  function matchesEmbeddedHardware(raw) {
    if (/visual\s+servo/i.test(raw)) return false;
    const r = raw;
    if (
      /\b(?:oled|lcd|tft|e-ink|eink|epd|ssd13\d*|sh1106|st77\d*|ili9\d*|max72\d*)\w*\b/i.test(
        r,
      )
    ) {
      return true;
    }
    if (/\b(?:seven|7)[-\s]?segment\b/i.test(r)) return true;
    if (/\b(?:i2c|spi|uart|usart|1-wire|onewire|i3c)\b/i.test(r)) return true;
    if (/can(?:open|[-\s]?bus)|controller\s+area\s+network/i.test(r)) return true;
    if (/\b(?:adc|dac|pwm)\b/i.test(r)) return true;
    if (/\b(?:relay|solenoid|stepper|buzzer|piezo)\b/i.test(r)) return true;
    if (/\bservo\b/i.test(r)) return true;
    if (/\b(?:eeprom|rtc\b|watchdog|shift register)\b/i.test(r)) return true;
    if (/\bflash(?:\s+memory)?\b/i.test(r)) return true;
    if (/\b(?:motor driver|h-?bridge|drv8\d*|tb6612|l293\w*)\b/i.test(r)) return true;
    if (
      /\b(?:imu|accelerometer|gyroscope|gyro\b|flex sensors?|hall sensor|ultrasonic|photodiode|optical encoder|rotary encoder|load cell|strain gauge)\b/i.test(
        r,
      )
    ) {
      return true;
    }
    if (/\b(?:neopixel|ws2812|sk68\d*|apa102)\b/i.test(r)) return true;
    if (/\btouch(?:screen|pad|panel|ctl)?\b/i.test(r)) return true;
    if (/\b(?:humidity|temperature|pressure|gas|light|proximity)\s+sensor\b/i.test(r))
      return true;
    if (/\bacs712\b/i.test(r)) return true;
    return false;
  }

  /**
   * First matching group wins. YOLO / Xacro-style rules are listed before broader rules.
   * @type {Array<{ id: string; label: string; match: (raw: string) => boolean }>}
   */
  const SKILL_GROUPS = [
    {
      id: "computer-vision",
      label: "Computer Vision",
      match: (raw) =>
        /yolo/i.test(raw) ||
        /arcface/i.test(raw) ||
        normalizeSkill(raw) === "computer vision" ||
        /blue[-\s/]*green\s+deployment/i.test(raw) ||
        /\bobject\s+tracking\b/i.test(raw) ||
        /\bobject\s+detection\b/i.test(raw) ||
        /\bopencv\b/i.test(raw) ||
        /\bimage\s+processing\b/i.test(raw) ||
        /\bface\s+recognition\b/i.test(raw) ||
        /\bclahe\b/i.test(raw) ||
        /hsv\s+colou?r\s+space/i.test(raw) ||
        /mediapipe|blazepose/i.test(raw) ||
        /real\s+time\s+vision/i.test(raw) ||
        /offline\s+tracking/i.test(raw) ||
        /multi\s+object\s+tracker/i.test(raw) ||
        /distance\s+estimation/i.test(raw) ||
        /\bedge\s+detection\b/i.test(raw) ||
        /traffic\s+density/i.test(raw) ||
        /visual\s+servo/i.test(raw) ||
        /underwater\s+imaging/i.test(raw) ||
        /\bhuman\s+activity\s+detection\b/i.test(raw) ||
        /\broboflow\b/i.test(raw) ||
        /\bultralytics\b/i.test(raw) ||
        normalizeSkill(raw) === "camera module" ||
        /camera\s+streaming/i.test(raw) ||
        /\bintel\s+realsense\b/i.test(raw) ||
        /\bffmpeg\b/i.test(raw) ||
        /\bgstreamer\b/i.test(raw) ||
        /gstreamer.*ffmpeg|ffmpeg.*gstreamer/i.test(raw) ||
        /\bvideo\s+streaming\b/i.test(raw),
    },
    {
      id: "python",
      label: "Python",
      match: (raw) => {
        return (
          /\bpython\b/i.test(raw) ||
          /pypi\s+packaging/i.test(raw) ||
          /pyserial/i.test(raw) ||
          /python\s*2\.?\s*7/i.test(raw) ||
          /pytorch/i.test(raw) ||
          /\bpyenv\b/i.test(raw)
        );
      },
    },
    {
      id: "ros2",
      label: "ROS2",
      match: (raw) => {
        const n = normalizeSkill(raw);
        return (
          n === "workspace setup" ||
          /ros2/i.test(raw) ||
          /rosbridge/i.test(raw) ||
          /urdf/i.test(raw) ||
          /turtlebot3/i.test(raw) ||
          /rviz2/i.test(raw) ||
          /\bcolcon\b/i.test(raw) ||
          /cyclone\s+dds/i.test(raw) ||
          /\bbehaviou?r\s+trees?\b/i.test(raw)
        );
      },
    },
    {
      id: "slam",
      label: "SLAM",
      match: (raw) =>
        /\bamcl\b/i.test(raw) ||
        /\bslam\s*toolbox\b/i.test(raw) ||
        normalizeSkill(raw) === "slam",
    },
    {
      id: "navigation2",
      label: "Navigation2",
      match: (raw) => {
        const n = normalizeSkill(raw);
        return (
          n === "navigation2" ||
          n === "localisation" ||
          /\bindoor\s+locali[sz]ation\b/i.test(raw) ||
          /\bmap\s+building\b/i.test(raw) ||
          /\bcartographer\b/i.test(raw) ||
          /\bteb\s+planner\b/i.test(raw) ||
          /\bpedestrian\s+dead\s+reckoning\b/i.test(raw) ||
          /\bheading\s+estimation\b/i.test(raw)
        );
      },
    },
    {
      id: "cad",
      label: "CAD",
      match: (raw) =>
        /cad\s+to\s+simulation/i.test(raw) ||
        /\bcad\b/i.test(raw) ||
        /\bsolidworks\b/i.test(raw),
    },
    {
      id: "robot-modelling",
      label: "Robot Modelling",
      match: (raw) =>
        normalizeSkill(raw).includes("xacro") ||
        /\brobot\s+descriptions?\b/i.test(raw) ||
        /\brobot\s+modell?ing\b/i.test(raw),
    },
    {
      id: "industrial-robotics",
      label: "Industrial Robotics",
      match: (raw) =>
        matchesIndustrialRobotBrand(raw) ||
        /\bindustrial\s+robotics\b/i.test(raw),
    },
    {
      id: "battery-management",
      label: "Battery Management",
      match: (raw) =>
        /\bbattery\s+management\b/i.test(raw) ||
        /\bbattery\s+powered\s+systems?\b/i.test(raw),
    },
    {
      id: "swarm-robotics",
      label: "Swarm Robotics",
      match: (raw) => /fleet/i.test(raw) || /\bswarm\s+robotics\b/i.test(raw),
    },
    {
      id: "marine-robotics",
      label: "Marine Robotics",
      match: (raw) =>
        /\bmarine\s+robotics\b/i.test(raw) ||
        /\bmarine\s+engineering\b/i.test(raw) ||
        /\bunderwater\s+robotics\b/i.test(raw) ||
        /\bmavlink\b/i.test(raw) ||
        /pymavlink/i.test(raw) ||
        /\bdronekit\b/i.test(raw) ||
        /\bblueos\b/i.test(raw),
    },
    {
      id: "aerial-robotics",
      label: "Aerial Robotics",
      match: (raw) => {
        const n = normalizeSkill(raw);
        return (
          n === "aerial robotics" ||
          /\baerial\s+robotics\b/i.test(raw) ||
          n === "uav modelling" ||
          /\buav\s+modell?ing\b/i.test(raw) ||
          /\bevtol\s+uav\b/i.test(raw) ||
          /\bdji\s+mavic/i.test(raw)
        );
      },
    },
    {
      id: "mobile-robotics",
      label: "Mobile Robotics",
      match: (raw) =>
        /\bindoor\s+mobile\s+robotics\b/i.test(raw) ||
        /\bmecanum\s+drive\b/i.test(raw) ||
        /\bdifferential\s+drive\b/i.test(raw) ||
        /\btwo\s+wheel\s+kinematics\b/i.test(raw) ||
        /\bmobile\s+robotics\b/i.test(raw),
    },
    {
      id: "gait-analysis",
      label: "Gait Analysis",
      match: (raw) =>
        /\bstride\s+estimation\b/i.test(raw) ||
        /\bstep\s+detection\b/i.test(raw) ||
        /\bbiomechanics\b/i.test(raw) ||
        /\bbipedal\s+walking\b/i.test(raw) ||
        /\bgait\s+analysis\b/i.test(raw),
    },
    {
      id: "manipulator-design",
      label: "Manipulator Design",
      match: (raw) =>
        /\bmanipulator\s+library\b/i.test(raw) ||
        /\bhyper\s+redundant\s+arms?\b/i.test(raw) ||
        /\bmanipulator\s+design\b/i.test(raw) ||
        /\bpuma\b/i.test(raw),
    },
    {
      id: "humanoid",
      label: "Humanoid",
      match: (raw) =>
        /\bhumanoid\b/i.test(raw) ||
        /\bnaoqi\b/i.test(raw) ||
        /\bnao\s+humanoid\b/i.test(raw),
    },
    {
      id: "real-time-monitoring",
      label: "Real Time Monitoring",
      match: (raw) =>
        normalizeSkill(raw) === "monitoring" ||
        normalizeSkill(raw) === "real time monitoring" ||
        /\breal[-\s]+time[-\s]+monitoring\b/i.test(raw) ||
        /\brealtime\s+monitoring\b/i.test(raw) ||
        /real\s+time\s+telemetry/i.test(raw) ||
        /prometheus\s+plus\s+grafana/i.test(raw) ||
        /prometheus.*grafana/i.test(raw) ||
        /structured\s+logging/i.test(raw) ||
        /\balerts?\b/i.test(raw) ||
        /notification/i.test(raw) ||
        /notify/i.test(raw),
    },
    {
      id: "linux",
      label: "Linux",
      match: (raw) =>
        normalizeSkill(raw) === "admin configuration tools" ||
        normalizeSkill(raw) === "configuration management" ||
        /\bshell\s+scripting\b/i.test(raw) ||
        /\blinux\b/i.test(raw),
    },
    {
      id: "web-development",
      label: "Web Development",
      match: (raw) =>
        /client\s+pwa/i.test(raw) ||
        /\bpwa\s*\(\s*web/i.test(raw) ||
        /web\s+dashboards?/i.test(raw) ||
        /live\s+web\s+dashboard/i.test(raw) ||
        /\bhtml\b/i.test(raw) ||
        /html\s*&\s*css/i.test(raw) ||
        /\bflask\b/i.test(raw) ||
        /\bfastapi\b/i.test(raw) ||
        /\buvicorn\b/i.test(raw) ||
        /\bwebsocket\b/i.test(raw) ||
        /swagger.*openapi|openapi.*swagger/i.test(raw) ||
        /\bstreamlit\b/i.test(raw) ||
        /operator\s+command\s+cent(?:re|er)\s*\(\s*web\s*\)/i.test(raw) ||
        /\brest\s+api\b/i.test(raw) ||
        /\bjavascript\b/i.test(raw),
    },
    {
      id: "iot",
      label: "IoT",
      match: (raw) => {
        const n = normalizeSkill(raw);
        return (
          n === "iot" ||
          /\biot\s+networking\b/i.test(raw) ||
          /mqtt\s+broker/i.test(raw) ||
          /lora\s*\/\s*rf|lora.*rf\s+communication/i.test(raw) ||
          /\bwifi\s+communication\b/i.test(raw) ||
          /wireless\s+telemetry/i.test(raw) ||
          /tcp\s*&\s*udp/i.test(raw) ||
          /\bnetworking\b/i.test(raw) ||
          /\bindustrial\s+iot\b/i.test(raw) ||
          /\bhome\s+automation\b/i.test(raw) ||
          /\bsensor\s+networks?\b/i.test(raw)
        );
      },
    },
    {
      id: "embedded-systems",
      label: "Embedded Systems",
      match: (raw) => {
        const n = normalizeSkill(raw);
        return (
          n === "embedded systems" ||
          /\bembedded\s+algorithms\b/i.test(raw) ||
          /\bembedded\s+c\+\+\b/i.test(raw) ||
          /\bembedded\s+prototyping\b/i.test(raw) ||
          /\bembedded\s+ai\s+prototyping\b/i.test(raw) ||
          /\bembedded\s+security\b/i.test(raw) ||
          /\bmicrocontrollers?\b/i.test(raw) ||
          /arduino/i.test(raw) ||
          /esp/i.test(raw) ||
          matchesEmbeddedHardware(raw) ||
          n === "device heartbeat" ||
          n === "device hearbeat" ||
          n === "magnetometer" ||
          n === "gpio zero" ||
          n === "gps module" ||
          n === "socket.io"
        );
      },
    },
    {
      id: "raspberry-pi",
      label: "Raspberry Pi",
      match: (raw) => {
        const n = normalizeSkill(raw);
        return (
          n === "raspberry pi" ||
          /raspberry\s+pi\s*\/\s*edge\s+device/i.test(raw) ||
          /\braspberry\s+pi\s+5\b/i.test(raw) ||
          /\bpicamera\b/i.test(raw)
        );
      },
    },
    {
      id: "edge-ai",
      label: "Edge AI",
      match: (raw) => {
        const n = normalizeSkill(raw);
        return (
          n === "edge ai" ||
          /\bedge\s+ai\b/i.test(raw) ||
          /\bedge\s+computing\b/i.test(raw) ||
          /\bhailort\b/i.test(raw) ||
          /\bhailo\s*rt\b/i.test(raw)
        );
      },
    },
    {
      id: "control-systems",
      label: "Control Systems",
      match: (raw) => /\bcontrol\b/i.test(raw),
    },
    {
      id: "robot-kinematics",
      label: "Robot Kinematics",
      match: (raw) => {
        const n = normalizeSkill(raw);
        return (
          n === "ackermann driver" ||
          n === "ackermann steering" ||
          /\bdh\s+parameters?\b/i.test(raw) ||
          /\bscara\b/i.test(raw) ||
          /\bforward\s+kinematics\b/i.test(raw) ||
          /\binverse\s+kinematics\b/i.test(raw) ||
          /\bjacobian\b/i.test(raw) ||
          /\bkinematic\s+modell?ing\b/i.test(raw) ||
          /\brobot\s+dynamics\b/i.test(raw)
        );
      },
    },
    {
      id: "robot-dynamics",
      label: "Robot Dynamics",
      match: (raw) =>
        /dynamics/i.test(raw) && !/\brobot\s+dynamics\b/i.test(raw),
    },
    {
      id: "simulink",
      label: "Simulink",
      match: (raw) =>
        /\bsimulink\b/i.test(raw) ||
        /simscape\s+electrical/i.test(raw) ||
        /simscape\s+multibody/i.test(raw),
    },
    {
      id: "opengl",
      label: "OpenGL",
      match: (raw) =>
        /\bopengl\b/i.test(raw) ||
        /\bglfw\b/i.test(raw) ||
        /\bglut\b/i.test(raw),
    },
    {
      id: "unity",
      label: "Unity",
      match: (raw) =>
        /conveyor\s+simulation/i.test(raw) || /\bunity\b/i.test(raw),
    },
    {
      id: "data-engineering",
      label: "Data Engineering",
      match: (raw) => {
        const n = normalizeSkill(raw);
        return (
          /dataset\s+engineering/i.test(raw) ||
          /\bdata engineering\b/i.test(raw) ||
          n === "data" ||
          /\btime\s+series\s+analysis\b/i.test(raw) ||
          /\btime\s+series\s+ml\b/i.test(raw) ||
          /\bpostgresql\b.*\bevents\b/i.test(raw) ||
          /\bredis\b.*\bcache\b/i.test(raw) ||
          /\benergy\s+analytics\b/i.test(raw) ||
          /\bsqlite\b/i.test(raw)
        );
      },
    },
    {
      id: "sensor-fusion",
      label: "Sensor Fusion",
      match: (raw) =>
        /\bsensor\s+fusion\b/i.test(raw) ||
        /\bsensor\s+integration\b/i.test(raw),
    },
    {
      id: "machine-learning",
      label: "Machine Learning",
      match: (raw) =>
        /\banomaly\b/i.test(raw) ||
        /\bmachine\s+learning\b/i.test(raw) ||
        /\btransfer\s+learning\b/i.test(raw) ||
        /tensorflow\s+lite/i.test(raw) ||
        /hugging\s+face\s+transformers/i.test(raw) ||
        /\bbert\b/i.test(raw) ||
        /\bnlp\s+classification\b/i.test(raw) ||
        /\bcnn\b/i.test(raw),
    },
    {
      id: "signal-processing",
      label: "Signal Processing",
      match: (raw) =>
        /digital\s+signal\s+decoding/i.test(raw) ||
        /fourier\s+transform/i.test(raw) ||
        /ppg\s+signal\s+processing/i.test(raw) ||
        /\bsignal\s+processing\b/i.test(raw) ||
        /\bsignal\s+decoding\b/i.test(raw),
    },
    {
      id: "speech-processing",
      label: "Speech Processing",
      match: (raw) =>
        /\bspeech\s+recognition\b/i.test(raw) ||
        /\btext\s+to\s+speech\b/i.test(raw),
    },
    {
      id: "reinforcement-learning",
      label: "Reinforcement Learning",
      match: (raw) =>
        normalizeSkill(raw) === "zmq remote api" ||
        /\breinforcement\s+learning\b/i.test(raw) ||
        /\bchoregraphe\b/i.test(raw) ||
        /\bcoppeliasim\b/i.test(raw) ||
        /coppelia\s*sim/i.test(raw),
    },
    {
      id: "gazebo",
      label: "Gazebo",
      match: (raw) => /\bgazebo\b/i.test(raw),
    },
    {
      id: "real-time-teleoperation",
      label: "Real Time Teleoperation",
      match: (raw) => /\breal\s+time\s+teleoperation\b/i.test(raw),
    },
    {
      id: "perception",
      label: "Perception",
      match: (raw) => /\bperception\b/i.test(raw),
    },
    {
      id: "cplusplus",
      label: "C++",
      match: (raw) => normalizeSkill(raw) === "c++",
    },
    {
      id: "matlab",
      label: "MATLAB",
      match: (raw) => /\bmatlab\b/i.test(raw),
    },
    {
      id: "blender",
      label: "Blender",
      match: (raw) => /\bblender\b/i.test(raw),
    },
    {
      id: "digital-twin",
      label: "Digital Twin",
      match: (raw) => /\bdigital\s+twin\b/i.test(raw),
    },
    {
      id: "human-robot-interaction",
      label: "Human Robot Interaction",
      match: (raw) => /\bhuman\s+robot\s+interaction\b/i.test(raw),
    },
    {
      id: "csharp",
      label: "C#",
      match: (raw) => normalizeSkill(raw) === "c#",
    },
    {
      id: "mujoco",
      label: "MuJoCo",
      match: (raw) => /\bmujoco\b/i.test(raw),
    },
    {
      id: "isaac-sim",
      label: "Isaac Sim",
      match: (raw) => /isaac\s+sim/i.test(raw),
    },
    {
      id: "sim-to-real",
      label: "Sim-to-Real Transfer",
      match: (raw) => /sim[-\s]to[-\s]real/i.test(raw),
    },
    {
      id: "behaviortree-cpp",
      label: "BehaviorTree.CPP",
      match: (raw) =>
        /behaviou?rtree\s*\.\s*cpp/i.test(raw) || /behaviou?rtree\s+cpp/i.test(raw),
    },
    {
      id: "imitation-learning",
      label: "Imitation Learning",
      match: (raw) => /\bimitation\s+learning\b/i.test(raw),
    },
    {
      id: "freertos",
      label: "FreeRTOS",
      match: (raw) => /\bfreertos\b/i.test(raw),
    },
    {
      id: "robotics-research",
      label: "Robotics Research",
      match: (raw) => /\brobotics\s+research\b/i.test(raw),
    },
    {
      id: "multi-agent-systems",
      label: "Multi-Agent Systems",
      match: (raw) => /\bmulti[-\s]?agent\s+systems?\b/i.test(raw),
    },
    {
      id: "chemical-sensing",
      label: "Chemical Sensing",
      match: (raw) => /\bchemical\s+sensing\b/i.test(raw),
    },
    {
      id: "docker",
      label: "Docker",
      match: (raw) => /\bdocker\b/i.test(raw),
    },
    {
      id: "webrtc",
      label: "WebRTC",
      match: (raw) => /\bwebrtc\b/i.test(raw),
    },
  ];

  const SKILLSET_PREFIX = "skillset:";

  /**
   * High-level skill areas for the filter bar. Each matches portfolio items that satisfy
   * any member key (group:… from SKILL_GROUPS, or ungrouped normalizeSkill string).
   */
  const SKILL_COARSE_GROUPS = [
    {
      id: "robotics-autonomy",
      label: "Robotics & Autonomy",
      members: [
        GROUP_PREFIX + "ros2",
        GROUP_PREFIX + "slam",
        GROUP_PREFIX + "navigation2",
        GROUP_PREFIX + "control-systems",
        GROUP_PREFIX + "sensor-fusion",
        GROUP_PREFIX + "perception",
        GROUP_PREFIX + "mobile-robotics",
        GROUP_PREFIX + "swarm-robotics",
        GROUP_PREFIX + "multi-agent-systems",
        GROUP_PREFIX + "real-time-teleoperation",
        GROUP_PREFIX + "human-robot-interaction",
        GROUP_PREFIX + "gait-analysis",
        GROUP_PREFIX + "aerial-robotics",
        GROUP_PREFIX + "marine-robotics",
        GROUP_PREFIX + "industrial-robotics",
        GROUP_PREFIX + "humanoid",
        GROUP_PREFIX + "robotics-research",
        "robotics toolbox",
        GROUP_PREFIX + "behaviortree-cpp",
        GROUP_PREFIX + "robot-kinematics",
        GROUP_PREFIX + "robot-dynamics",
      ],
    },
    {
      id: "manipulation-mechanical",
      label: "Manipulation & Mechanical Design",
      members: [
        GROUP_PREFIX + "robot-modelling",
        GROUP_PREFIX + "manipulator-design",
        GROUP_PREFIX + "cad",
        GROUP_PREFIX + "blender",
        GROUP_PREFIX + "digital-twin",
      ],
    },
    {
      id: "ai-ml",
      label: "AI & Machine Learning",
      members: [
        GROUP_PREFIX + "machine-learning",
        GROUP_PREFIX + "computer-vision",
        GROUP_PREFIX + "reinforcement-learning",
        GROUP_PREFIX + "imitation-learning",
        GROUP_PREFIX + "sim-to-real",
        GROUP_PREFIX + "edge-ai",
        GROUP_PREFIX + "speech-processing",
        GROUP_PREFIX + "signal-processing",
        GROUP_PREFIX + "data-engineering",
        GROUP_PREFIX + "chemical-sensing",
      ],
    },
    {
      id: "simulation",
      label: "Simulation",
      members: [
        GROUP_PREFIX + "gazebo",
        GROUP_PREFIX + "mujoco",
        GROUP_PREFIX + "isaac-sim",
        GROUP_PREFIX + "simulink",
        GROUP_PREFIX + "opengl",
        GROUP_PREFIX + "unity",
      ],
    },
    {
      id: "embedded-hardware",
      label: "Embedded & Hardware",
      members: [
        GROUP_PREFIX + "embedded-systems",
        GROUP_PREFIX + "raspberry-pi",
        GROUP_PREFIX + NVIDIA_JETSON_DEVELOPER_GROUP,
        GROUP_PREFIX + "freertos",
        GROUP_PREFIX + "battery-management",
        GROUP_PREFIX + "iot",
        GROUP_PREFIX + "linux",
        GROUP_PREFIX + "edge-ai",
      ],
    },
    {
      id: "software-development",
      label: "Software & Development",
      members: [
        GROUP_PREFIX + "python",
        GROUP_PREFIX + "cplusplus",
        GROUP_PREFIX + "csharp",
        GROUP_PREFIX + "matlab",
        GROUP_PREFIX + "docker",
        GROUP_PREFIX + "webrtc",
        GROUP_PREFIX + "web-development",
        GROUP_PREFIX + "real-time-monitoring",
        "test scripts",
      ],
    },
  ];

  function labelForMemberKey(memberKey) {
    if (memberKey.startsWith(GROUP_PREFIX)) {
      const gid = memberKey.slice(GROUP_PREFIX.length);
      if (gid === NVIDIA_JETSON_DEVELOPER_GROUP) return NVIDIA_JETSON_DEVELOPER_LABEL;
      const sg = SKILL_GROUPS.find((x) => x.id === gid);
      return sg ? sg.label : gid;
    }
    return memberKey.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function coarseGroupIdContainingMember(memberKey) {
    for (const g of SKILL_COARSE_GROUPS) {
      if (g.members.includes(memberKey)) return g.id;
    }
    return null;
  }

  const el = (id) => document.getElementById(id);

  function normalizeSkill(s) {
    return String(s).trim().toLowerCase().replace(/\s+/g, " ");
  }

  /** Skills omitted from chips and project cards (normalized lower case). */
  const HIDDEN_SKILLS = new Set([
    "aerial robotics",
    "aruco markers",
    "audio streaming",
    "asset pipeline",
    "automatic rollback",
    "behaviour scripting",
    "behaviour trees",
    "behavior trees",
    "behavioural classifier",
    "bh1750",
    "biomedical sensing",
    "cmake",
    "cross platform build",
    "data schemas",
    "domain isolation",
    "edge ai",
    "edge computing",
    "educational tooling",
    "embedded algorithms",
    "embedded c++",
    "embedded ai prototyping",
    "embedded prototyping",
    "embedded security",
    "embedded systems",
    "energy analytics",
    "engine architecture",
    "event orchestration",
    "fault localisation",
    "fault localization",
    "ffmpeg",
    "field hardware prototyping",
    "gesture authoring",
    "glassmorphism ui",
    "gstreamer / ffmpeg",
    "hailort",
    "identity rule checks",
    "ina226",
    "intel realsense",
    "interface",
    "ir receiver module",
    "javascript",
    "jupyter",
    "lab coursework",
    "library packaging",
    "live notebooks",
    "live notebook",
    "live animation",
    "localisation",
    "indoor localisation",
    "map building",
    "camera module",
    "camera streaming",
    "cartographer",
    "teb planner",
    "pedestrian dead reckoning",
    "hands on learning",
    "heading estimation",
    "human activity detection",
    "transfer learning",
    "tensorflow lite",
    "hugging face transformers",
    "bert",
    "nlp classification",
    "choregraphe",
    "coppeliasim",
    "cnn",
    "message bus routing",
    "matplotlib",
    "minio (clips)",
    "microcontroller",
    "microcontrollers",
    "mavlink",
    "pymavlink",
    "modular design",
    "monitoring",
    "motion scripting",
    "nao humanoid",
    "newsapi",
    "numerical methods",
    "numpy",
    "package curation",
    "pet safety devices",
    "picamera",
    "puma",
    "raspberry pi",
    "raspberry pi / edge device",
    "raspberry pi 5",
    "photodetectors",
    "power switching",
    "power transmission",
    "rapid prototyping",
    "real time systems",
    "real time monitoring",
    "real-time monitoring",
    "realtime monitoring",
    "real time visualisation",
    "real time visualization",
    "reconstruction error",
    "release",
    "rest api",
    "robot description",
    "robot descriptions",
    "roboflow",
    "research tooling",
    "rule and fusion",
    "rules and fusion",
    "safety automation",
    "scenario authoring",
    "scipy",
    "serial communication",
    "setuptools",
    "severity ranking",
    "simple commander api",
    "simulation",
    "simulation assets",
    "smart agriculture",
    "smart cities",
    "smart city systems",
    "smart contracts",
    "smartphone torch",
    "solar pv",
    "solidity",
    "solidworks",
    "spatial zone / tripwire logic",
    "speech recognition",
    "sqlite",
    "staged rollout",
    "stanford arm",
    "system provisioning",
    "systemd autostart",
    "temporal schedule engine",
    "text to speech",
    "three phase systems",
    "tokamak maintenance",
    "transistor driver",
    "trajectory analysis",
    "trajectory generation",
    "trajectory reconstruction",
    "trajectory simulation",
    "trajectory tracking",
    "troubleshooting",
    "uav modelling",
    "ultralytics",
    "video streaming",
    "version pinned edge images",
    "visible light communication",
    "visualisation",
    "visualization",
    "voltage level shifting",
    "wearable electronics",
    "weighted confidence scoring",
    "wind energy",
    "workspace organisation",
    "workspace organization",
  ]);

  function isSkillHidden(raw) {
    return HIDDEN_SKILLS.has(normalizeSkill(raw));
  }

  function projectMatchesGroup(project, groupId) {
    if (groupId === NVIDIA_JETSON_DEVELOPER_GROUP) {
      if (NVIDIA_JETSON_DEVELOPER_PROJECT_IDS.has(project.id)) return true;
      return (project.skills || []).some((s) =>
        /nvidia\s+jetson|jetson\b/i.test(String(s)),
      );
    }
    const def = SKILL_GROUPS.find((g) => g.id === groupId);
    if (!def) return false;
    return (project.skills || []).some((s) => def.match(s));
  }

  function projectCategory(p) {
    const c = p.category;
    const fallback = data.categoryDefault || "projects";
    if (c && JSON_CATEGORY_IDS.has(c)) return c;
    return fallback;
  }

  function projectsInPortfolioSection(sectionId) {
    return data.projects.filter((p) => {
      const c = projectCategory(p);
      if (sectionId === "research-experience")
        return c === "research-experience" || c === "papers";
      return c === sectionId;
    });
  }

  function projectsInActiveSection() {
    return projectsInPortfolioSection(activeSectionId);
  }

  function portfolioSectionLabel(id) {
    const s = PORTFOLIO_SECTIONS.find((x) => x.id === id);
    return s ? s.label : id;
  }

  function portfolioItemMatchesSkillKey(p, skillKey) {
    if (!skillKey) return true;
    if (skillKey.startsWith(SKILLSET_PREFIX)) {
      const sid = skillKey.slice(SKILLSET_PREFIX.length);
      const def = SKILL_COARSE_GROUPS.find((g) => g.id === sid);
      if (!def) return false;
      return def.members.some((m) => portfolioItemMatchesSkillKey(p, m));
    }
    if (skillKey.startsWith(GROUP_PREFIX)) {
      const gid = skillKey.slice(GROUP_PREFIX.length);
      return projectMatchesGroup(p, gid);
    }
    return (p.skills || []).some(
      (s) => !isSkillHidden(s) && normalizeSkill(s) === skillKey,
    );
  }

  /** Research tab: papers stay visible when a skill filter is active (they carry no skill tags). */
  function researchSectionItemMatchesSkillKey(p, skillKey) {
    if (projectCategory(p) === "papers") return true;
    return portfolioItemMatchesSkillKey(p, skillKey);
  }

  /** Items in a portfolio tab; when skillKey set, only those matching the skill filter (Education ignores skill filter). */
  function portfolioTabCountForSection(sectionId, skillKey) {
    const pool = projectsInPortfolioSection(sectionId);
    if (
      sectionId === "education" ||
      sectionId === "competitions" ||
      sectionId === "awards"
    )
      return pool.length;
    const filter = skillKey || null;
    if (!filter) return pool.length;
    return pool.filter((p) =>
      sectionId === "research-experience"
        ? researchSectionItemMatchesSkillKey(p, filter)
        : portfolioItemMatchesSkillKey(p, filter),
    ).length;
  }

  function projectsMatching(activeKey) {
    const pool = projectsInActiveSection();
    if (
      activeSectionId === "education" ||
      activeSectionId === "competitions" ||
      activeSectionId === "awards"
    )
      return pool;
    if (!activeKey) return pool;
    if (activeSectionId === "research-experience")
      return pool.filter((p) => researchSectionItemMatchesSkillKey(p, activeKey));
    return pool.filter((p) => portfolioItemMatchesSkillKey(p, activeKey));
  }

  function renderProjectSectionTabs() {
    const host = el("project-section-tabs");
    if (!host) return;
    host.textContent = "";
    for (const { id, label } of PORTFOLIO_SECTIONS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "project-section-tab";
      b.setAttribute("role", "tab");
      b.id = `portfolio-tab-${id}`;
      b.setAttribute("aria-selected", id === activeSectionId ? "true" : "false");
      b.setAttribute("aria-controls", "project-grid");
      b.dataset.sectionId = id;
      b.dataset.sectionLabel = label;
      b.addEventListener("click", () => setActivePortfolioSection(id));
      host.appendChild(b);
    }
    refreshPortfolioTabLabels();
  }

  function refreshPortfolioTabLabels() {
    const host = el("project-section-tabs");
    if (!host || !Array.isArray(data.projects)) return;
    const skillFilter = activeSkill || null;
    host.querySelectorAll(".project-section-tab").forEach((btn) => {
      const id = btn.dataset.sectionId;
      const label = btn.dataset.sectionLabel || portfolioSectionLabel(id);
      const n = portfolioTabCountForSection(id, skillFilter);
      btn.textContent = `${label} (${n})`;
    });
  }

  function syncProjectSectionTabs() {
    const host = el("project-section-tabs");
    if (!host) return;
    host.querySelectorAll(".project-section-tab").forEach((btn) => {
      const id = btn.dataset.sectionId;
      btn.setAttribute("aria-selected", id === activeSectionId ? "true" : "false");
    });
  }

  function setActivePortfolioSection(id) {
    if (!PORTFOLIO_CATEGORY_IDS.has(id)) return;
    activeSectionId = id;
    syncProjectSectionTabs();
    renderProjects();
    refreshPortfolioTabLabels();
  }

  function buildSkillsetLabelMap() {
    const m = new Map();
    for (const g of SKILL_COARSE_GROUPS) {
      m.set(SKILLSET_PREFIX + g.id, g.label);
      for (const mem of g.members) {
        m.set(mem, labelForMemberKey(mem));
      }
    }
    return m;
  }

  function renderSkillFilterBar() {
    const host = el("skill-chips");
    if (!host) return;
    host.textContent = "";

    const coarseRow = document.createElement("div");
    coarseRow.className = "skill-chips-row skill-chips-row--coarse";

    for (const g of SKILL_COARSE_GROUPS) {
      const sk = SKILLSET_PREFIX + g.id;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "skill-coarse-btn";
      b.textContent = g.label;
      b.dataset.skillsetId = g.id;
      const expandedHere = expandedSkillsetId === g.id;
      const memberHit = g.members.includes(activeSkill);
      b.setAttribute("aria-expanded", expandedHere ? "true" : "false");
      b.setAttribute(
        "aria-pressed",
        expandedHere || activeSkill === sk || memberHit ? "true" : "false",
      );
      b.addEventListener("click", () => {
        if (expandedSkillsetId === g.id) {
          if (activeSkill === sk) {
            setActiveSkill(null);
          } else {
            setActiveSkill(sk);
          }
        } else {
          setActiveSkill(sk);
        }
      });
      coarseRow.appendChild(b);
    }
    host.appendChild(coarseRow);

    if (expandedSkillsetId) {
      const def = SKILL_COARSE_GROUPS.find((x) => x.id === expandedSkillsetId);
      if (def) {
        const subRow = document.createElement("div");
        subRow.className = "skill-chips-row skill-chips-row--sub";
        subRow.setAttribute("role", "group");
        subRow.setAttribute(
          "aria-label",
          `Skills in ${def.label.replace(/&/g, "and")}`,
        );

        for (const m of def.members) {
          const sb = document.createElement("button");
          sb.type = "button";
          sb.className = "skill-sub-btn";
          sb.textContent = labelForMemberKey(m);
          sb.dataset.memberKey = m;
          sb.setAttribute("aria-pressed", activeSkill === m ? "true" : "false");
          sb.addEventListener("click", () => {
            if (activeSkill === m) {
              setActiveSkill(SKILLSET_PREFIX + expandedSkillsetId);
            } else {
              setActiveSkill(m);
            }
          });
          subRow.appendChild(sb);
        }
        host.appendChild(subRow);
      }
    }
  }

  /**
   * Fill a heading with plain text and wrap listed place names in .region-highlight (longest match wins).
   * @param {HTMLElement} h3
   * @param {string} title
   * @param {string[] | undefined} regions
   */
  function fillTitleWithRegions(h3, title, regions) {
    h3.textContent = "";
    if (!title) return;
    if (!regions || regions.length === 0) {
      h3.textContent = title;
      return;
    }
    const sorted = [
      ...new Set(regions.map((r) => String(r).trim()).filter(Boolean)),
    ].sort((a, b) => b.length - a.length);
    let remaining = title;
    while (remaining.length > 0) {
      let earliest = -1;
      let matched = "";
      for (const r of sorted) {
        const idx = remaining.indexOf(r);
        if (idx < 0) continue;
        if (
          earliest < 0 ||
          idx < earliest ||
          (idx === earliest && r.length > matched.length)
        ) {
          earliest = idx;
          matched = r;
        }
      }
      if (earliest < 0) {
        h3.appendChild(document.createTextNode(remaining));
        break;
      }
      if (earliest > 0) {
        h3.appendChild(document.createTextNode(remaining.slice(0, earliest)));
      }
      const span = document.createElement("span");
      span.className = "region-highlight";
      span.textContent = matched;
      h3.appendChild(span);
      remaining = remaining.slice(earliest + matched.length);
    }
  }

  function setActiveSkill(skillKey) {
    activeSkill = skillKey;
    if (!skillKey) {
      expandedSkillsetId = null;
    } else if (skillKey.startsWith(SKILLSET_PREFIX)) {
      expandedSkillsetId = skillKey.slice(SKILLSET_PREFIX.length);
    } else {
      const pid = coarseGroupIdContainingMember(skillKey);
      expandedSkillsetId = pid;
    }

    const btnAll = el("btn-all-skills");
    const hint = el("filter-hint");
    if (btnAll) {
      btnAll.setAttribute("aria-pressed", skillKey ? "false" : "true");
    }
    if (hint) {
      if (!skillKey) {
        hint.textContent = "";
      } else {
        const label =
          skillKeyToLabel.get(skillKey) || labelForMemberKey(skillKey) || skillKey;
        hint.textContent = `Filtered by: ${label}`;
      }
    }
    renderSkillFilterBar();
    renderProjects();
    refreshPortfolioTabLabels();
  }

  /**
   * @param {HTMLElement} card
   * @param {{ title: string, paperAuthors?: Array<{ name: string, self?: boolean }>, venue?: string, venuePrefix?: string }} p
   */
  function appendPaperCard(card, p) {
    card.classList.add("project-card--paper");
    const wrap = document.createElement("div");
    wrap.className = "paper-citation";

    wrap.appendChild(document.createTextNode("\u201c"));
    const titleEl = document.createElement("span");
    titleEl.className = "paper-citation-title";
    titleEl.textContent = p.title;
    wrap.appendChild(titleEl);
    wrap.appendChild(document.createTextNode("\u201d "));

    const authorsPart = document.createElement("span");
    authorsPart.className = "paper-citation-authors";
    const authors = p.paperAuthors || [];
    authors.forEach((a, i) => {
      if (i > 0) authorsPart.appendChild(document.createTextNode(", "));
      const name = typeof a === "string" ? a : a.name;
      const isSelf = typeof a === "object" && a && a.self;
      if (isSelf) {
        const strong = document.createElement("strong");
        strong.textContent = name;
        authorsPart.appendChild(strong);
      } else {
        authorsPart.appendChild(document.createTextNode(name));
      }
    });
    authorsPart.appendChild(document.createTextNode(". "));

    const venueEl = document.createElement("em");
    venueEl.className = "paper-citation-venue";
    venueEl.textContent = (p.venuePrefix || "") + (p.venue || "");

    wrap.appendChild(authorsPart);
    wrap.appendChild(venueEl);
    card.appendChild(wrap);
  }

  function renderProjects() {
    const grid = el("project-grid");
    if (!grid) return;

    grid.classList.toggle(
      "project-grid--wide",
      activeSectionId === "education" ||
        activeSectionId === "competitions" ||
        activeSectionId === "research-experience" ||
        activeSectionId === "awards",
    );

    const list = projectsMatching(activeSkill);
    const secName = portfolioSectionLabel(activeSectionId);

    grid.textContent = "";
    if (list.length === 0) {
      const empty = document.createElement("p");
      empty.className = "section-desc project-empty";
      empty.textContent =
        activeSkill &&
        activeSectionId !== "education" &&
        activeSectionId !== "competitions" &&
        activeSectionId !== "awards"
          ? `No entries in ${secName} match this skill filter. Try another category or use Show All.`
          : `No entries in ${secName} yet. Add mappings in site/data/portfolio-categories.json and run extract_portfolio.py, or pick another category.`;
      grid.appendChild(empty);
      return;
    }
    for (const p of list) {
      const card = document.createElement("article");
      const cat = projectCategory(p);
      if (cat === "papers") {
        card.className = "project-card project-card--paper";
        appendPaperCard(card, p);
        grid.appendChild(card);
        continue;
      }
      card.className =
        cat === "competitions" || cat === "awards"
          ? "project-card project-card--competition"
          : "project-card";
      const h = document.createElement("h3");
      if (
        (cat === "work-experience" ||
          cat === "contracts" ||
          cat === "research-experience" ||
          cat === "education" ||
          cat === "competitions" ||
          cat === "awards") &&
        p.workRegions?.length
      ) {
        fillTitleWithRegions(h, p.title, p.workRegions);
      } else {
        h.textContent = p.title;
      }
      card.appendChild(h);
      if (p.subtitle) {
        const sub = document.createElement("p");
        sub.className = "project-card-subtitle";
        sub.textContent = p.subtitle;
        card.appendChild(sub);
      }
      if (p.detail) {
        const det = document.createElement("p");
        det.className = "project-card-detail";
        det.textContent = p.detail;
        card.appendChild(det);
      }

      const skills = (p.skills || []).filter((s) => !isSkillHidden(s));
      if (skills.length > 0) {
        const meta = document.createElement("div");
        meta.className = "project-meta";
        const max = 5;
        skills.slice(0, max).forEach((s) => {
          const pill = document.createElement("span");
          pill.className = "project-pill";
          pill.textContent = s;
          pill.title = s;
          meta.appendChild(pill);
        });
        if (skills.length > max) {
          const more = document.createElement("span");
          more.className = "project-pill more";
          more.textContent = `+${skills.length - max} more`;
          meta.appendChild(more);
        }
        card.appendChild(meta);
      }
      grid.appendChild(card);
    }
  }

  async function init() {
    const btnAll = el("btn-all-skills");
    if (btnAll) {
      btnAll.addEventListener("click", () => setActiveSkill(null));
    }

    try {
      const res = await fetch("data/projects.json", { cache: "no-store" });
      if (!res.ok) throw new Error(res.statusText);
      data = await res.json();
    } catch (e) {
      el("project-grid").innerHTML =
        "<p class=\"section-desc\">Could not load project data. Run <code>python3 scripts/extract_portfolio.py</code> from the portfolio root, then serve this folder over HTTP.</p>";
      console.error(e);
      return;
    }

    if (!Array.isArray(data.projects)) {
      console.error("Invalid projects.json");
      return;
    }

    activeSectionId = "work-experience";
    renderProjectSectionTabs();

    skillKeyToLabel = buildSkillsetLabelMap();
    setActiveSkill(null);
  }

  const HERO_CAROUSEL_MS = 5000;

  function initHeroCarousel() {
    const root = el("hero-carousel");
    if (!root) return;
    const slides = Array.from(root.querySelectorAll(".hero-carousel-slide"));
    const dots = Array.from(root.querySelectorAll(".hero-carousel-dot"));
    if (slides.length === 0) return;

    let idx = 0;
    let timer = null;

    const show = (next) => {
      idx = ((next % slides.length) + slides.length) % slides.length;
      slides.forEach((s, j) => {
        const on = j === idx;
        s.classList.toggle("is-active", on);
        s.setAttribute("aria-hidden", on ? "false" : "true");
      });
      dots.forEach((d, j) => {
        d.setAttribute("aria-selected", j === idx ? "true" : "false");
      });
    };

    dots.forEach((d) => {
      d.addEventListener("click", () => {
        show(parseInt(d.dataset.slideTo, 10));
        restartTimer();
      });
    });

    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");

    function restartTimer() {
      if (timer) clearInterval(timer);
      timer = null;
      if (slides.length < 2 || mql.matches) return;
      timer = setInterval(() => show(idx + 1), HERO_CAROUSEL_MS);
    }

    show(0);
    restartTimer();
    mql.addEventListener("change", restartTimer);
  }

  const PROJECTS_DISPLAY_BASE = "projects-display/";

  /**
   * Infinite horizontal strip of images from `projects-display/manifest.json`.
   */
  async function initProjectsDisplayMarquee() {
    const track = el("projects-marquee-track");
    const section = el("project-photos");
    if (!track) return;

    let names = [];
    try {
      const res = await fetch(`${PROJECTS_DISPLAY_BASE}manifest.json`, {
        cache: "no-store",
      });
      if (!res.ok) {
        if (section) section.hidden = true;
        return;
      }
      const manifest = await res.json();
      const list = manifest.images;
      if (!Array.isArray(list) || list.length === 0) {
        if (section) section.hidden = true;
        return;
      }
      names = list;
    } catch (e) {
      console.warn("projects-display marquee:", e);
      if (section) section.hidden = true;
      return;
    }

    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");

    function buildFigures() {
      const frag = document.createDocumentFragment();
      for (const name of names) {
        const fig = document.createElement("figure");
        fig.className = "projects-marquee-item";
        const img = document.createElement("img");
        img.src = PROJECTS_DISPLAY_BASE + encodeURIComponent(name);
        img.alt = "";
        img.loading = "lazy";
        img.decoding = "async";
        fig.appendChild(img);
        frag.appendChild(fig);
      }
      return frag;
    }

    const rowA = buildFigures();
    const rowB = buildFigures();
    track.appendChild(rowA);
    track.appendChild(rowB);

    const durationSec = Math.max(36, Math.round(names.length * 6));
    function applyMotion() {
      if (mql.matches) {
        track.style.animation = "none";
      } else {
        track.style.animation = `projects-marquee-scroll ${durationSec}s linear infinite`;
      }
    }
    applyMotion();
    mql.addEventListener("change", applyMotion);
  }

  init();
  initHeroCarousel();
  initProjectsDisplayMarquee();
})();

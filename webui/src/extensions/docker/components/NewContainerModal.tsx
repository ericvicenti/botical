/**
 * New Container Modal
 *
 * Form for creating a new Docker container.
 */

import { useState } from "react";
import { X, Plus, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useCreateContainer, useStartContainer, type CreateContainerInput } from "../api";

interface NewContainerModalProps {
  params: Record<string, never>;
  onClose?: () => void;
}

interface PortMapping {
  hostPort: string;
  containerPort: string;
  protocol: "tcp" | "udp";
}

interface VolumeMapping {
  hostPath: string;
  containerPath: string;
  mode: "rw" | "ro";
}

interface EnvVar {
  key: string;
  value: string;
}

export function NewContainerModal({ onClose }: NewContainerModalProps) {
  const [image, setImage] = useState("");
  const [name, setName] = useState("");
  const [ports, setPorts] = useState<PortMapping[]>([]);
  const [volumes, setVolumes] = useState<VolumeMapping[]>([]);
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [autoRemove, setAutoRemove] = useState(false);
  const [restartPolicy, setRestartPolicy] = useState<CreateContainerInput["restartPolicy"]>("no");
  const [startAfterCreate, setStartAfterCreate] = useState(true);

  const createContainer = useCreateContainer();
  const startContainer = useStartContainer();

  const handleAddPort = () => {
    setPorts([...ports, { hostPort: "", containerPort: "", protocol: "tcp" }]);
  };

  const handleRemovePort = (index: number) => {
    setPorts(ports.filter((_, i) => i !== index));
  };

  const handleAddVolume = () => {
    setVolumes([...volumes, { hostPath: "", containerPath: "", mode: "rw" }]);
  };

  const handleRemoveVolume = (index: number) => {
    setVolumes(volumes.filter((_, i) => i !== index));
  };

  const handleAddEnvVar = () => {
    setEnvVars([...envVars, { key: "", value: "" }]);
  };

  const handleRemoveEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!image.trim()) {
      alert("Image is required");
      return;
    }

    const input: CreateContainerInput = {
      image: image.trim(),
      name: name.trim() || undefined,
      ports: ports
        .filter((p) => p.hostPort && p.containerPort)
        .map((p) => ({
          hostPort: parseInt(p.hostPort, 10),
          containerPort: parseInt(p.containerPort, 10),
          protocol: p.protocol,
        })),
      volumes: volumes
        .filter((v) => v.hostPath && v.containerPath)
        .map((v) => ({
          hostPath: v.hostPath,
          containerPath: v.containerPath,
          mode: v.mode,
        })),
      env: envVars
        .filter((e) => e.key)
        .reduce((acc, e) => ({ ...acc, [e.key]: e.value }), {}),
      autoRemove,
      restartPolicy,
    };

    createContainer.mutate(input, {
      onSuccess: async (result) => {
        if (startAfterCreate) {
          startContainer.mutate(result.id, {
            onSuccess: () => {
              onClose?.();
            },
            onError: (error) => {
              console.error("Failed to start container:", error);
              alert(`Container created but failed to start: ${error.message}`);
              onClose?.();
            },
          });
        } else {
          onClose?.();
        }
      },
      onError: (error) => {
        console.error("Failed to create container:", error);
        alert(`Failed to create container: ${error.message}`);
      },
    });
  };

  const isSubmitting = createContainer.isPending || startContainer.isPending;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-zinc-900 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h2 className="text-lg font-medium">Create Container</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-4">
            {/* Image */}
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">
                Image <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={image}
                onChange={(e) => setImage(e.target.value)}
                placeholder="e.g., nginx:latest"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm"
                required
              />
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">
                Container Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., my-nginx"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm"
              />
            </div>

            {/* Port Mappings */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-zinc-400">Port Mappings</label>
                <button
                  type="button"
                  onClick={handleAddPort}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
              </div>
              {ports.map((port, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input
                    type="number"
                    value={port.hostPort}
                    onChange={(e) => {
                      const newPorts = [...ports];
                      newPorts[i].hostPort = e.target.value;
                      setPorts(newPorts);
                    }}
                    placeholder="Host"
                    className="w-24 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm"
                  />
                  <span className="text-zinc-500 self-center">:</span>
                  <input
                    type="number"
                    value={port.containerPort}
                    onChange={(e) => {
                      const newPorts = [...ports];
                      newPorts[i].containerPort = e.target.value;
                      setPorts(newPorts);
                    }}
                    placeholder="Container"
                    className="w-24 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm"
                  />
                  <select
                    value={port.protocol}
                    onChange={(e) => {
                      const newPorts = [...ports];
                      newPorts[i].protocol = e.target.value as "tcp" | "udp";
                      setPorts(newPorts);
                    }}
                    className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm"
                  >
                    <option value="tcp">TCP</option>
                    <option value="udp">UDP</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => handleRemovePort(i)}
                    className="p-1.5 text-zinc-500 hover:text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Environment Variables */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-zinc-400">Environment Variables</label>
                <button
                  type="button"
                  onClick={handleAddEnvVar}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
              </div>
              {envVars.map((env, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={env.key}
                    onChange={(e) => {
                      const newEnvVars = [...envVars];
                      newEnvVars[i].key = e.target.value;
                      setEnvVars(newEnvVars);
                    }}
                    placeholder="Key"
                    className="w-32 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm"
                  />
                  <input
                    type="text"
                    value={env.value}
                    onChange={(e) => {
                      const newEnvVars = [...envVars];
                      newEnvVars[i].value = e.target.value;
                      setEnvVars(newEnvVars);
                    }}
                    placeholder="Value"
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveEnvVar(i)}
                    className="p-1.5 text-zinc-500 hover:text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Volume Mappings */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-zinc-400">Volume Mappings</label>
                <button
                  type="button"
                  onClick={handleAddVolume}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
              </div>
              {volumes.map((volume, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={volume.hostPath}
                    onChange={(e) => {
                      const newVolumes = [...volumes];
                      newVolumes[i].hostPath = e.target.value;
                      setVolumes(newVolumes);
                    }}
                    placeholder="Host path"
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm"
                  />
                  <span className="text-zinc-500 self-center">:</span>
                  <input
                    type="text"
                    value={volume.containerPath}
                    onChange={(e) => {
                      const newVolumes = [...volumes];
                      newVolumes[i].containerPath = e.target.value;
                      setVolumes(newVolumes);
                    }}
                    placeholder="Container path"
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm"
                  />
                  <select
                    value={volume.mode}
                    onChange={(e) => {
                      const newVolumes = [...volumes];
                      newVolumes[i].mode = e.target.value as "rw" | "ro";
                      setVolumes(newVolumes);
                    }}
                    className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm"
                  >
                    <option value="rw">RW</option>
                    <option value="ro">RO</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => handleRemoveVolume(i)}
                    className="p-1.5 text-zinc-500 hover:text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Options */}
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={startAfterCreate}
                  onChange={(e) => setStartAfterCreate(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Start after create</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={autoRemove}
                  onChange={(e) => setAutoRemove(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Remove when stopped</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-zinc-400">Restart policy:</span>
                <select
                  value={restartPolicy}
                  onChange={(e) => setRestartPolicy(e.target.value as CreateContainerInput["restartPolicy"])}
                  className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm"
                >
                  <option value="no">Never</option>
                  <option value="always">Always</option>
                  <option value="unless-stopped">Unless stopped</option>
                  <option value="on-failure">On failure</option>
                </select>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 px-4 py-3 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !image.trim()}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded text-sm",
                "bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {startAfterCreate ? "Create & Start" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

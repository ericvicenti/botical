import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, Github, Heart } from "lucide-react";

export const Route = createFileRoute("/settings/about")({
  component: AboutPage,
});

function AboutPage() {
  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-2xl font-bold text-text-primary mb-2">About Iris</h1>
      <p className="text-text-muted mb-8">
        An AI-powered development environment.
      </p>

      <div className="space-y-6">
        <div className="p-4 bg-bg-secondary rounded-lg border border-border">
          <div className="text-sm text-text-muted mb-1">Version</div>
          <div className="text-text-primary font-mono">0.1.0-alpha</div>
        </div>

        <div>
          <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wide mb-3">
            Features
          </h2>
          <ul className="space-y-2 text-text-primary">
            <li className="flex items-start gap-2">
              <span className="text-accent-primary mt-1">•</span>
              <span>AI-assisted coding with multiple provider support</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-accent-primary mt-1">•</span>
              <span>Task and session management</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-accent-primary mt-1">•</span>
              <span>Integrated file browser and editor</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-accent-primary mt-1">•</span>
              <span>Process and service management</span>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wide mb-3">
            Links
          </h2>
          <div className="space-y-2">
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-accent-primary hover:underline"
            >
              <Github className="w-4 h-4" />
              <span>Source Code</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        <div className="pt-4 border-t border-border">
          <p className="text-sm text-text-muted flex items-center gap-1">
            Made with <Heart className="w-4 h-4 text-accent-error" /> by the Iris team
          </p>
        </div>
      </div>
    </div>
  );
}

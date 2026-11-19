package deploy_test

import (
	"regexp"
	"slices"
	"strings"
	"testing"

	"go.yaml.in/yaml/v3"
)

// loadLocalCompose parses the local overlay as a node tree, so the
// `!override` tag stays visible.
func loadLocalCompose(t *testing.T) *yaml.Node {
	t.Helper()
	var doc yaml.Node
	if err := yaml.Unmarshal([]byte(readFile(t, "compose.local.yaml")), &doc); err != nil {
		t.Fatalf("compose.local.yaml: %v", err)
	}
	return doc.Content[0]
}

// child returns the value under key in a mapping node, or nil.
func child(n *yaml.Node, key string) *yaml.Node {
	if n == nil || n.Kind != yaml.MappingNode {
		return nil
	}
	for i := 0; i+1 < len(n.Content); i += 2 {
		if n.Content[i].Value == key {
			return n.Content[i+1]
		}
	}
	return nil
}

// path follows keys from n.
func path(n *yaml.Node, keys ...string) *yaml.Node {
	for _, k := range keys {
		n = child(n, k)
	}
	return n
}

// strs returns the scalar values of a sequence node.
func strs(n *yaml.Node) []string {
	if n == nil {
		return nil
	}
	var out []string
	for _, c := range n.Content {
		out = append(out, c.Value)
	}
	return out
}

// services returns name -> service node.
func services(t *testing.T) map[string]*yaml.Node {
	t.Helper()
	s := child(loadLocalCompose(t), "services")
	if s == nil {
		t.Fatal("compose.local.yaml has no services")
	}
	out := map[string]*yaml.Node{}
	for i := 0; i+1 < len(s.Content); i += 2 {
		out[s.Content[i].Value] = s.Content[i+1]
	}
	return out
}

func TestLocalComposePinsImages(t *testing.T) {
	var got []string
	for _, svc := range services(t) {
		if img := child(svc, "image"); img != nil {
			got = append(got, img.Value)
		}
	}
	slices.Sort(got)
	want := []string{"pgsty/mc:RELEASE.2026-10-26T00-00-00Z", "rustfs/rustfs:1.0.4"}
	if !slices.Equal(got, want) {
		t.Errorf("images = %v, want %v", got, want)
	}
}

func TestLocalComposeRustFSLoopbackOnly(t *testing.T) {
	got := strs(child(services(t)["rustfs"], "ports"))
	want := []string{"127.0.0.1:9000:9000", "127.0.0.1:9001:9001"}
	if !slices.Equal(got, want) {
		t.Errorf("rustfs ports = %v, want %v", got, want)
	}
}

func TestLocalComposeHasNoSecretValues(t *testing.T) {
	svcs := services(t)
	for name, svc := range svcs {
		env := child(svc, "environment")
		if env == nil {
			continue
		}
		var keys []string
		if env.Kind == yaml.MappingNode {
			for i := 0; i < len(env.Content); i += 2 {
				keys = append(keys, env.Content[i].Value)
			}
		} else {
			for _, e := range strs(env) {
				keys = append(keys, strings.SplitN(e, "=", 2)[0])
			}
		}
		for _, k := range keys {
			if u := strings.ToUpper(k); strings.Contains(u, "SECRET") || strings.Contains(u, "PASSWORD") {
				t.Errorf("%s: environment sets %s; secrets must come from secret files", name, k)
			}
		}
	}
	if got := strs(child(svcs["rustfs"], "secrets")); !slices.Equal(got, []string{"rustfs_root_secret"}) {
		t.Errorf("rustfs secrets = %v", got)
	}
	got := strs(child(svcs["s3-init"], "secrets"))
	slices.Sort(got)
	if want := []string{"rustfs_root_secret", "s3_ro_secret_key", "s3_secret_key"}; !slices.Equal(got, want) {
		t.Errorf("s3-init secrets = %v, want %v", got, want)
	}
	if f := path(loadLocalCompose(t), "secrets", "rustfs_root_secret", "file"); f == nil || f.Value != "./secrets/rustfs_root_secret" {
		t.Errorf("secrets.rustfs_root_secret.file = %v, want ./secrets/rustfs_root_secret", f)
	}
}

func TestLocalComposeStartOrder(t *testing.T) {
	svcs := services(t)
	if child(svcs["rustfs"], "healthcheck") == nil {
		t.Error("rustfs has no healthcheck")
	}
	if c := path(svcs["s3-init"], "depends_on", "rustfs", "condition"); c == nil || c.Value != "service_healthy" {
		t.Errorf("s3-init must wait for rustfs to be healthy, got %v", c)
	}
	for _, name := range []string{"zrelay", "zview-server"} {
		if c := path(svcs[name], "depends_on", "s3-init", "condition"); c == nil || c.Value != "service_completed_successfully" {
			t.Errorf("%s must wait for s3-init to succeed, got %v", name, c)
		}
	}
}

func TestLocalComposeMovesZviewTo8081(t *testing.T) {
	ports := child(services(t)["zview-server"], "ports")
	if ports == nil || ports.Tag != "!override" {
		t.Fatalf("zview-server ports must be tagged !override, got %v", ports)
	}
	if got := strs(ports); !slices.Equal(got, []string{"127.0.0.1:8081:8080/tcp"}) {
		t.Errorf("zview-server ports = %v", got)
	}
}

func TestLocalComposeInitUsesRepoPolicies(t *testing.T) {
	vols := strings.Join(strs(child(services(t)["s3-init"], "volumes")), "\n")
	for _, f := range []string{"./minio-relay-policy.json", "./minio-zview-policy.json"} {
		if !regexp.MustCompile(`(?m)^` + regexp.QuoteMeta(f) + `:[^\n]*:ro$`).MatchString(vols) {
			t.Errorf("s3-init does not mount %s read-only; volumes:\n%s", f, vols)
		}
	}
}

func TestDeployScriptDefaultsToProductionCompose(t *testing.T) {
	sh := readFile(t, "deploy.sh")
	for _, want := range []string{`COMPOSE_FILE="${COMPOSE_FILE:-deploy/compose.yaml}"`, "export COMPOSE_FILE"} {
		if !strings.Contains(sh, want) {
			t.Errorf("deploy.sh lacks %q", want)
		}
	}
	if strings.Contains(sh, "-f deploy/compose.yaml") {
		t.Error("deploy.sh still hard-codes -f deploy/compose.yaml, which overrides COMPOSE_FILE")
	}
}

func TestDeployScriptChecksRustFSSecretForLocal(t *testing.T) {
	sh := readFile(t, "deploy.sh")
	re := regexp.MustCompile(`(?s)case "\$COMPOSE_FILE" in\s*\*compose\.local\.yaml\*\).*?secrets/rustfs_root_secret.*?esac`)
	if !re.MatchString(sh) {
		t.Error("deploy.sh does not check secrets/rustfs_root_secret when COMPOSE_FILE includes compose.local.yaml")
	}
}

func TestDeployScriptFindsMacTailscaleApp(t *testing.T) {
	if !strings.Contains(readFile(t, "deploy.sh"), "/Applications/Tailscale.app/Contents/MacOS/Tailscale") {
		t.Error("deploy.sh does not fall back to the macOS Tailscale app CLI")
	}
}

// recipe returns the recipe lines of a Makefile target.
func recipe(t *testing.T, target string) string {
	t.Helper()
	m := regexp.MustCompile(`(?m)^` + regexp.QuoteMeta(target) + `:[^\n]*\n((?:\t[^\n]*\n?)*)`).FindStringSubmatch(readFile(t, "../Makefile"))
	if m == nil {
		t.Fatalf("Makefile has no %s target", target)
	}
	return m[1]
}

func TestMakeLocalTargets(t *testing.T) {
	mk := readFile(t, "../Makefile")
	if !strings.Contains(mk, "deploy/compose.yaml:deploy/compose.local.yaml") {
		t.Error("Makefile does not name both compose files")
	}
	if up := recipe(t, "local-up"); !strings.Contains(up, "COMPOSE_FILE=") || !strings.Contains(up, "deploy/deploy.sh") {
		t.Errorf("local-up must run deploy/deploy.sh with COMPOSE_FILE set; recipe:\n%s", up)
	}
	if logs := recipe(t, "local-logs"); !strings.Contains(logs, "logs -f") {
		t.Errorf("local-logs must follow logs; recipe:\n%s", logs)
	}
}

func TestMakeLocalDownKeepsVolumes(t *testing.T) {
	down := recipe(t, "local-down")
	if !strings.Contains(down, " down") {
		t.Errorf("local-down must run compose down; recipe:\n%s", down)
	}
	if regexp.MustCompile(`(^|\s)(-v|--volumes)(\s|$)`).MatchString(down) {
		t.Errorf("local-down deletes volumes (the recordings); recipe:\n%s", down)
	}
}

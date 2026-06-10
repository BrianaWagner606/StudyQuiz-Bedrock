/* ============================================================================
 *  ✿  STUDY QUIZ — CURRICULUM PACKS  ✿
 * ============================================================================
 *
 *  Structured, ready-made study tracks for the 2026 tech-mastery path. Each
 *  "area" is a curriculum pack a player (or teacher) can select instead of
 *  typing a free-form topic. Picking a pack drives the AI question generator
 *  with the area's subject, a rotating set of its sub-topics, and a difficulty
 *  tier — exactly like the Field Console web app this was ported from.
 *
 *  Packs are AI-driven: when the proxy/key is available the questions are
 *  endless and tuned to the focus + difficulty. With AI off, the game falls
 *  back to whatever bundled questions exist for the pack's key (see
 *  bundledTopics.js) and otherwise to the general fallback topic.
 *
 *  TO ADD A PACK: copy an area block, give it a unique `id` and `code`, and
 *  fill in its modules + subtopics. `subtopics` is the list the generator
 *  rotates through, so make them specific and exam-relevant.
 * ============================================================================ */

export const CURRICULUM = [
  {
    id: "cloud",
    code: "CLD",
    name: "Cloud & IaC",
    eyebrow: "AWS · Terraform · CDK",
    desc: "Architect, provision, and operate cloud infrastructure as code, anchored on AWS and the Well-Architected Framework.",
    certs: [
      "AWS Solutions Architect Associate (SAA-C03)",
      "AWS Developer Associate (DVA-C02)",
      "HashiCorp Terraform Associate"
    ],
    modules: [
      { t: "Core networking & identity", topics: ["VPC, subnets, route tables", "Security groups vs NACLs", "IAM roles, policies, least privilege", "PrivateLink & VPC endpoints"] },
      { t: "Compute & containers", topics: ["EC2 & auto scaling", "Lambda & event-driven", "ECS Fargate", "EKS basics", "Compute cost trade-offs"] },
      { t: "Storage & data", topics: ["S3 classes & lifecycle", "EBS vs EFS", "RDS & Aurora", "DynamoDB design"] },
      { t: "Delivery & edge", topics: ["CloudFront & caching", "API Gateway", "Route 53 routing"] },
      { t: "Infrastructure as code", topics: ["Terraform state & modules", "AWS CDK constructs", "Drift & plan/apply", "Landing zones & multi-account"] },
      { t: "Well-Architected", topics: ["Operational excellence", "Reliability & DR", "Cost optimization", "Performance efficiency"] }
    ],
    subtopics: ["VPC networking", "IAM and least privilege", "Lambda and serverless", "ECS Fargate", "S3 and storage classes", "RDS and DynamoDB", "Terraform modules and state", "AWS CDK", "CloudFront and edge", "Well-Architected cost and reliability"]
  },

  {
    id: "devops",
    code: "OPS",
    name: "DevOps & SRE",
    eyebrow: "CI/CD · K8s · Observability",
    desc: "Ship reliably and operate at scale: pipelines, containers, orchestration, and the discipline of measuring reliability.",
    certs: [
      "HashiCorp Terraform Associate",
      "Certified Kubernetes Administrator (CKA)",
      "AWS DevOps Engineer Professional"
    ],
    modules: [
      { t: "CI/CD pipelines", topics: ["Build/test/deploy stages", "GitHub Actions / GitLab CI", "Artifact & image promotion", "Deployment strategies (blue-green, canary)"] },
      { t: "Containers", topics: ["Docker images & layers", "Multi-stage builds", "Registries & scanning", "Image size & security"] },
      { t: "Kubernetes", topics: ["Pods, Deployments, Services", "ConfigMaps & Secrets", "Ingress & networking", "Resource limits & HPA", "Helm & GitOps (Argo/Flux)"] },
      { t: "Observability", topics: ["Metrics, logs, traces", "Prometheus & Grafana", "OpenTelemetry", "Alerting & dashboards"] },
      { t: "SRE practice", topics: ["SLI / SLO / error budgets", "Incident response", "Postmortems", "Toil reduction"] }
    ],
    subtopics: ["CI/CD pipeline design", "deployment strategies blue-green canary", "Docker images and multi-stage builds", "Kubernetes pods deployments services", "Kubernetes networking and ingress", "GitOps Argo Flux", "Prometheus metrics and PromQL", "OpenTelemetry tracing", "SLO SLI and error budgets", "incident response and postmortems"]
  },

  {
    id: "aiml",
    code: "AI",
    name: "AI / ML Engineering",
    eyebrow: "LLMs · RAG · Agents · MLOps",
    desc: "Build production AI systems: retrieval, agents, evaluation, and the operational glue that keeps models honest in 2026.",
    certs: [
      "AWS Machine Learning Engineer Associate (MLA-C01)",
      "AWS ML Specialty (MLS-C01)"
    ],
    modules: [
      { t: "LLM foundations", topics: ["Tokens, context windows", "Temperature & sampling", "Prompt structure", "System vs user roles", "Function/tool calling"] },
      { t: "Retrieval (RAG)", topics: ["Chunking strategies", "Embeddings & vector DBs", "Hybrid & re-ranking", "Grounding & citations", "Context rot & failure modes"] },
      { t: "Agentic systems", topics: ["Tool use & orchestration", "Planning & memory", "Multi-step workflows", "Guardrails & safety"] },
      { t: "Evaluation", topics: ["Rubrics & human eval", "LLM-as-judge", "Regression suites", "Bias & artifact scoring"] },
      { t: "MLOps & serving", topics: ["Model registry & versioning", "Inference endpoints (Bedrock/SageMaker)", "Latency & cost", "Monitoring drift"] }
    ],
    subtopics: ["LLM tokens context windows and sampling", "prompt engineering and tool calling", "RAG chunking and embeddings", "vector databases and hybrid retrieval", "re-ranking and grounding citations", "agentic tool use and orchestration", "LLM evaluation rubrics and LLM-as-judge", "guardrails and safety", "model serving Bedrock SageMaker", "monitoring drift and MLOps"]
  },

  {
    id: "security",
    code: "SEC",
    name: "Security",
    eyebrow: "Cloud · IAM · Zero Trust",
    desc: "Defend systems by design: identity, encryption, network boundaries, and threat modeling for cloud-native stacks.",
    certs: [
      "AWS Security Specialty (SCS-C02)",
      "CompTIA Security+"
    ],
    modules: [
      { t: "Identity & access", topics: ["Least privilege & RBAC", "Federation & SSO", "MFA & session security", "Privilege escalation paths"] },
      { t: "Encryption", topics: ["At rest vs in transit", "KMS & key rotation", "TLS fundamentals", "Secrets management"] },
      { t: "Network security", topics: ["Segmentation", "WAF & rate limiting", "DDoS mitigation", "Zero trust architecture"] },
      { t: "Posture & response", topics: ["Threat modeling (STRIDE)", "CSPM & config rules", "Logging & detection", "Incident & forensics"] },
      { t: "AppSec", topics: ["OWASP Top 10", "Dependency & supply chain", "Input validation", "Secure SDLC"] }
    ],
    subtopics: ["IAM least privilege and RBAC", "federation SSO and MFA", "encryption at rest and KMS", "TLS and secrets management", "network segmentation and WAF", "zero trust architecture", "threat modeling STRIDE", "cloud security posture CSPM", "OWASP Top 10", "supply chain security"]
  },

  {
    id: "data",
    code: "DAT",
    name: "Data Engineering",
    eyebrow: "Lakes · Pipelines · Streaming",
    desc: "Move and shape data at scale: lakes, ETL/ELT, orchestration, and streaming that holds up under volume.",
    certs: [
      "AWS Data Engineer Associate (DEA-C01)",
      "Databricks Data Engineer Associate"
    ],
    modules: [
      { t: "Storage & lakes", topics: ["Data lake vs warehouse", "S3 lake + Glue + Athena", "File formats (Parquet, ORC)", "Partitioning & layout"] },
      { t: "Pipelines", topics: ["ETL vs ELT", "Batch processing (Spark)", "Incremental loads", "Idempotency"] },
      { t: "Streaming", topics: ["Kafka / Kinesis", "Windowing & watermarks", "Exactly-once semantics", "Backpressure"] },
      { t: "Orchestration", topics: ["Airflow DAGs", "Scheduling & retries", "Dependencies & SLAs"] },
      { t: "Modeling & quality", topics: ["Dimensional modeling", "Slowly changing dimensions", "Data quality & contracts", "Lineage"] }
    ],
    subtopics: ["data lake vs warehouse", "S3 Glue Athena and Parquet", "partitioning and file layout", "ETL vs ELT and Spark", "incremental loads and idempotency", "Kafka Kinesis streaming", "windowing and exactly-once", "Airflow orchestration", "dimensional modeling and SCD", "data quality and contracts"]
  },

  {
    id: "lang",
    code: "LNG",
    name: "Programming Languages",
    eyebrow: "9 languages · Python anchor",
    desc: "Cross-language fluency. Pick a language — the drill targets its idioms, memory model, concurrency, and ecosystem.",
    certs: ["Portfolio: Polyglot Quiz app (9 languages)"],
    langs: ["Python", "Java", "Go", "C#/.NET", "TypeScript", "JavaScript", "Rust", "Swift", "Kotlin"],
    modules: [
      { t: "Syntax & types", topics: ["Type systems & inference", "Null/optional handling", "Generics", "Pattern matching"] },
      { t: "Memory & runtime", topics: ["Stack vs heap", "GC vs ownership", "Value vs reference", "Lifetimes (Rust)"] },
      { t: "Concurrency", topics: ["Threads & async", "Goroutines / channels", "async/await", "Data races & safety"] },
      { t: "Idioms & ecosystem", topics: ["Error handling style", "Package managers", "Standard library", "Common pitfalls"] }
    ],
    subtopics: ["type system and generics", "null optional and error handling", "memory model stack heap and GC", "ownership and lifetimes", "concurrency threads async and channels", "idiomatic patterns", "standard library and tooling", "common pitfalls and gotchas"]
  },

  {
    id: "sysdesign",
    code: "SYS",
    name: "System Design",
    eyebrow: "Scale · Interviews",
    desc: "Reason about distributed systems: caching, queues, consistency, and the trade-offs interviewers actually probe.",
    certs: ["Interview prep · staff-track fundamentals"],
    modules: [
      { t: "Scaling", topics: ["Vertical vs horizontal", "Load balancing", "Stateless services", "Sharding & partitioning"] },
      { t: "Data & consistency", topics: ["SQL vs NoSQL", "CAP theorem", "Replication", "Eventual vs strong consistency"] },
      { t: "Caching & queues", topics: ["Cache strategies & eviction", "CDN", "Message queues", "Pub/sub & event-driven"] },
      { t: "Reliability", topics: ["Rate limiting", "Idempotency", "Circuit breakers", "Graceful degradation"] }
    ],
    subtopics: ["horizontal scaling and load balancing", "sharding and partitioning", "SQL vs NoSQL trade-offs", "CAP theorem and consistency", "replication strategies", "caching strategies and eviction", "message queues and pub-sub", "rate limiting and idempotency", "circuit breakers and resilience"]
  },

  {
    id: "csfund",
    code: "CS",
    name: "CS Fundamentals",
    eyebrow: "DSA · Algorithms",
    desc: "The bedrock: data structures, algorithmic complexity, and the systems concepts that show up in every screen.",
    certs: ["Interview prep · technical screens"],
    modules: [
      { t: "Data structures", topics: ["Arrays & strings", "Hash maps & sets", "Stacks & queues", "Trees & graphs", "Heaps"] },
      { t: "Algorithms", topics: ["Sorting & searching", "Recursion & DP", "BFS / DFS", "Greedy & two-pointer"] },
      { t: "Complexity", topics: ["Big-O time & space", "Amortized analysis", "Trade-offs"] },
      { t: "Systems basics", topics: ["Processes vs threads", "Memory & paging", "TCP/IP & HTTP", "Concurrency primitives"] }
    ],
    subtopics: ["arrays strings and hash maps", "stacks queues and heaps", "trees and graphs", "sorting and searching", "recursion and dynamic programming", "BFS DFS traversal", "Big-O time and space complexity", "OS processes threads and memory", "networking TCP IP and HTTP"]
  }
];

export function listAreas() {
  return CURRICULUM;
}

export function getArea(id) {
  const wanted = `${id ?? ""}`.trim();
  if (!wanted) {
    return null;
  }
  return CURRICULUM.find((area) => area.id === wanted) ?? null;
}

// Stable storage/dedup key for a pack. The programming-languages pack is keyed
// per-language so mastery in Python doesn't leak into Rust, etc.
export function getCurriculumTopicKey(area, lang) {
  if (!area) {
    return "";
  }
  if (area.langs && area.langs.length > 0) {
    const chosen = `${lang ?? area.langs[0]}`.trim() || area.langs[0];
    const slug = chosen.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    return `lang_${slug}`;
  }
  return area.id;
}

// Human-readable subject handed to the AI prompt's "Topic:" line.
export function getCurriculumSubject(area, lang) {
  if (!area) {
    return "";
  }
  if (area.langs && area.langs.length > 0) {
    const chosen = `${lang ?? area.langs[0]}`.trim() || area.langs[0];
    return `the ${chosen} programming language`;
  }
  return area.name;
}

// Pick a few sub-topics for this batch so repeated requests diverge across the
// pack's breadth instead of hammering the same few facts. `seed` lets callers
// rotate deterministically; when omitted we shuffle randomly.
export function pickFocus(area, count = 3, seed = null) {
  if (!area || !Array.isArray(area.subtopics) || area.subtopics.length === 0) {
    return "";
  }
  const pool = [...area.subtopics];
  const picks = [];
  for (let i = 0; i < count && pool.length > 0; i += 1) {
    const idx = seed === null
      ? Math.floor(Math.random() * pool.length)
      : (seed + i) % pool.length;
    picks.push(pool.splice(idx, 1)[0]);
  }
  return picks.join("; ");
}

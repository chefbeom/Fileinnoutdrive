{{- define "wafflebear.name" -}}
wafflebear
{{- end -}}

{{- define "wafflebear.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "wafflebear.workerScheduling" -}}
affinity:
  nodeAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      nodeSelectorTerms:
        - matchExpressions:
            - key: node-role.kubernetes.io/control-plane
              operator: DoesNotExist
            - key: node-role.kubernetes.io/master
              operator: DoesNotExist
          matchFields:
            - key: metadata.name
              operator: NotIn
              values:
                - master
topologySpreadConstraints:
  - maxSkew: 1
    topologyKey: kubernetes.io/hostname
    whenUnsatisfiable: DoNotSchedule
    labelSelector:
      matchLabels:
{{ toYaml . | nindent 8 }}
{{- end -}}
{{- define "wafflebear.requiredImageReference" -}}
{{- $component := index . 0 -}}
{{- $repository := (index . 1 | default "" | toString) -}}
{{- $tag := (index . 2 | default "" | toString) -}}
{{- $digest := (index . 3 | default "" | toString) -}}
{{- if eq $repository "" -}}
{{- fail (printf "%s.image.repository must be set" $component) -}}
{{- end -}}
{{- if ne $digest "" -}}
{{- if ne $tag "" -}}
{{- fail (printf "%s.image.tag must be empty when %s.image.digest is set" $component $component) -}}
{{- end -}}
{{- if not (regexMatch "^sha256:[0-9a-f]{64}$" $digest) -}}
{{- fail (printf "%s.image.digest must use sha256:<64 lowercase hex chars>" $component) -}}
{{- end -}}
{{- printf "%s@%s" $repository $digest -}}
{{- else -}}
{{- if or (eq $tag "") (eq $tag "latest") -}}
{{- fail (printf "%s.image.tag must be set to an explicit immutable tag or %s.image.digest must be set; latest is not allowed" $component $component) -}}
{{- end -}}
{{- printf "%s:%s" $repository $tag -}}
{{- end -}}
{{- end -}}

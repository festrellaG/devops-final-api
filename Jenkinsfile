// Hito 4, paso 3: Build y Sonar en paralelo, seguidos de Quality Gate.
pipeline {
    agent any

    environment {
        APP_NAME = 'devops-final-api'
        AWS_REGION = 'us-east-1'
        ECR_REPOSITORY = 'devops-final-api'
        AWS_CLI_IMAGE = 'amazon/aws-cli:latest'
    }

    options {
        skipDefaultCheckout(true)
        disableConcurrentBuilds()
        timeout(time: 20, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '10', artifactNumToKeepStr: '5'))
    }

    triggers {
        githubPush()
    }

    stages {
        stage('Get Source') {
            steps {
                // Limpiar solamente el workspace de este job, no los datos de Jenkins.
                //Obtiene el código fuente del repositorio.
                deleteDir()
                checkout scm
                script {
                    env.SOURCE_COMMIT = sh(
                        script: 'git rev-parse HEAD',
                        returnStdout: true
                    ).trim()
                    echo "Commit procesado: ${env.SOURCE_COMMIT}"
                }
            }
        }

        stage('Preparacion y pruebas') { //Instala dependencias y genera cobertura de pruebas
            agent {
                docker {
                    image 'node:24-bookworm'
                    // Trabajar en el mismo nodo y checkout del stage Get Source.
                    reuseNode true
                }
            }
            stages {
                stage('Preparar') {
                    steps {
                        sh 'node --version && npm --version && tar --version'
                        sh 'npm ci'
                    }
                }
                stage('Pruebas y cobertura') {
                    steps {
                        sh 'npm run test:coverage'
                    }
                }
            }
        }

        stage('Build y Sonar') { //En paralelo build empaqueta en un contenedor node.js y sonar analiza desde el entorno de jenkins
            // Ambas ramas leen el mismo checkout y la cobertura ya terminada.
            // No ejecutar npm ci ni deleteDir dentro de este bloque.
            parallel {
                stage('Build') {
                    agent {
                        docker {
                            image 'node:24-bookworm'
                            reuseNode true
                        }
                    }
                    steps {
                        // El script solo escribe el artefacto en dist y archivos temporales.
                        sh 'npm run build'
                    }
                }
                stage('Sonar') {
                    steps {
                        // Hereda el nodo Jenkins, NO el contenedor de la rama Build.
                        sh 'test -s coverage/lcov.info'
                        script {
                            def scannerHome = tool 'sonar-scanner'
                            withSonarQubeEnv('sonarqube-server') {
                                withEnv(["SCANNER_HOME=${scannerHome}"]) {
                                    sh '"$SCANNER_HOME/bin/sonar-scanner"'
                                }
                            }
                        }
                    }
                }
            }
        }

        /*
        el flujo:
        1.Jenkins ejecuta el análisis de Sonar
        2.SonarQube devuelve un task ID
        3.Jenkins espera a la respuesta del Quality Gate
        4.Si sale OK, continúa
        5.Si sale ERROR o FAILED, aborta el pipeline
        */

        /*
        Esto indica que SonarQube está enviando una notificación HTTP a Jenkins cuando termina
        el análisis. Ese webhook es la pieza que permite que Jenkins reciba el resultado del análisis
         y ejecute el paso de waitForQualityGate.
        */

        stage('Quality Gate') {
            steps {
                // Requiere el webhook de SonarQube hacia /sonarqube-webhook/ en Jenkins.
                timeout(time: 5, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }

        stage('Prueba del paquete') {//Prueba el paquete comienza cuando ambas ramas terminan correctamente
            agent {
                docker {
                    image 'node:24-bookworm'
                    reuseNode true
                }
            }
            steps {
                // Solo se llega aquí si Build y Sonar terminaron correctamente.
                sh 'npm run test:package'
            }
        }

        stage('Archivar artefactos') { //Archiva los artefactos generados si todas las etapas anteriores fueron exitosas    
            steps {
                archiveArtifacts artifacts: 'dist/*.tgz,coverage/lcov.info',
                    fingerprint: true,
                    onlyIfSuccessful: true
            }
        }

        stage('Docker Build y Smoke Test') {
            steps {
                script {
                    env.IMAGE_TAG = "${env.BUILD_NUMBER}-${env.SOURCE_COMMIT.take(7)}"
                    sh 'docker build --tag "$APP_NAME:$IMAGE_TAG" .'

                    def containerId = ''
                    try {
                        containerId = sh(
                            script: 'docker run --detach "$APP_NAME:$IMAGE_TAG"',
                            returnStdout: true
                        ).trim()
                        int attempts = 0
                        withEnv(["CONTAINER_ID=${containerId}"]) {
                            while (attempts < 30) {
                                def healthStatus = sh(
                                    script: 'docker inspect --format="{{.State.Health.Status}}" "$CONTAINER_ID"',
                                    returnStdout: true
                                ).trim()
                                if (healthStatus == 'healthy') {
                                    echo 'Smoke test correcto: /health respondió correctamente.'
                                    break
                                }
                                if (healthStatus == 'unhealthy') {
                                    error('Smoke test fallido: el contenedor reportó estado unhealthy.')
                                }
                                sleep time: 2, unit: 'SECONDS'
                                attempts++
                            }
                        }
                        if (attempts == 30) {
                            error('Smoke test agotó el tiempo de espera para /health.')
                        }
                    } finally {
                        if (containerId) {
                            withEnv(["CONTAINER_ID=${containerId}"]) {
                                sh 'docker rm --force "$CONTAINER_ID" >/dev/null 2>&1 || true'
                            }
                        }
                    }
                }
            }
        }

        stage('Publish to ECR') {
            steps {
                withCredentials([
                    string(credentialsId: 'aws-access-key-id', variable: 'AWS_ACCESS_KEY_ID'),
                    string(credentialsId: 'aws-secret-access-key', variable: 'AWS_SECRET_ACCESS_KEY')
                ]) {
                    script {
                        env.AWS_ACCOUNT_ID = sh(
                            script: '''docker run --rm \\
                                -e AWS_ACCESS_KEY_ID \\
                                -e AWS_SECRET_ACCESS_KEY \\
                                -e AWS_DEFAULT_REGION="$AWS_REGION" \\
                                "$AWS_CLI_IMAGE" sts get-caller-identity --query Account --output text''',
                            returnStdout: true
                        ).trim()
                        env.ECR_REGISTRY = "${env.AWS_ACCOUNT_ID}.dkr.ecr.${env.AWS_REGION}.amazonaws.com"
                        env.IMAGE_URI = "${env.ECR_REGISTRY}/${env.ECR_REPOSITORY}:${env.IMAGE_TAG}"
                    }

                    sh '''#!/bin/bash
set -euo pipefail
error_file="$(mktemp)"
trap 'rm -f "$error_file"; docker logout "$ECR_REGISTRY" >/dev/null 2>&1 || true' EXIT
if docker run --rm \\
    -e AWS_ACCESS_KEY_ID \\
    -e AWS_SECRET_ACCESS_KEY \\
    -e AWS_DEFAULT_REGION="$AWS_REGION" \\
    "$AWS_CLI_IMAGE" ecr describe-repositories --repository-names "$ECR_REPOSITORY" >/dev/null 2>"$error_file"; then
    echo "El repositorio ECR $ECR_REPOSITORY ya existe."
else
    describe_status=$?
    if grep -q 'RepositoryNotFoundException' "$error_file"; then
        docker run --rm \\
            -e AWS_ACCESS_KEY_ID \\
            -e AWS_SECRET_ACCESS_KEY \\
            -e AWS_DEFAULT_REGION="$AWS_REGION" \\
            "$AWS_CLI_IMAGE" ecr create-repository \\
                --repository-name "$ECR_REPOSITORY" \\
                --image-tag-mutability IMMUTABLE \\
                --image-scanning-configuration scanOnPush=true \\
                --encryption-configuration encryptionType=AES256 >/dev/null
        echo "Repositorio ECR $ECR_REPOSITORY creado."
    else
        cat "$error_file" >&2
        exit "$describe_status"
    fi
fi
docker run --rm \\
    -e AWS_ACCESS_KEY_ID \\
    -e AWS_SECRET_ACCESS_KEY \\
    -e AWS_DEFAULT_REGION="$AWS_REGION" \\
    "$AWS_CLI_IMAGE" ecr get-login-password --region "$AWS_REGION" \\
    | docker login --username AWS --password-stdin "$ECR_REGISTRY"
docker tag "$APP_NAME:$IMAGE_TAG" "$IMAGE_URI"
docker push "$IMAGE_URI"
'''
                    echo "Imagen publicada: ${env.IMAGE_URI}"
                }
            }
        }
    }

    post {
        success {
            echo "Validacion completada para ${env.SOURCE_COMMIT}. Paquete disponible en los artefactos del build."
        }
        failure {
            echo 'La ejecucion fallo. Revisar el primer error en Console Output; no se publica ninguna imagen.'
        }
    }
}
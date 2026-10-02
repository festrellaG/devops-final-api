// Hito 4, paso 1: Sonar secuencial. Paralelismo y Quality Gate vendrán después.
pipeline {
    agent any

    options {
        skipDefaultCheckout(true)
        disableConcurrentBuilds()
        timeout(time: 20, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '10', artifactNumToKeepStr: '5'))
    }

    stages {
        stage('Get Source') {
            steps {
                // Limpiar solamente el workspace de este job, no los datos de Jenkins.
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

        stage('Validacion Node.js') {
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
                stage('Build') {
                    steps {
                        sh 'npm run build'
                    }
                }
                stage('Prueba del paquete') {
                    steps {
                        sh 'npm run test:package'
                    }
                }
            }
        }

        stage('Sonar') {
            steps {
                // Fuera del contenedor Node: el nodo Jenkins ya alcanza sonarqube:9000.
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

        stage('Archivar artefactos') {
            steps {
                archiveArtifacts artifacts: 'dist/*.tgz,coverage/lcov.info',
                    fingerprint: true,
                    onlyIfSuccessful: true
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
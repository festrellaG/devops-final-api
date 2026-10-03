// Hito 4, paso 3: Build y Sonar en paralelo, seguidos de Quality Gate.
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
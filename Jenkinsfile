pipeline {
    agent any

    triggers {
        githubPush()
    }

    options {
        timestamps()
        disableConcurrentBuilds()
    }

    environment {
        COMPOSE_PROJECT_NAME = 'inventory_part2'
        COMPOSE_FILE = 'docker-compose-part2.yml'
        ENV_FILE = '/etc/inventory-app-part2.env'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
                script {
                    env.COMMIT_AUTHOR_EMAIL = sh(
                        script: "git log -1 --format='%ae'",
                        returnStdout: true
                    ).trim()
                }
            }
        }

        stage('Validate') {
            steps {
                sh '''
                    test -f "$COMPOSE_FILE"
                    test -r "$ENV_FILE"
                    docker compose \
                      --env-file "$ENV_FILE" \
                      -f "$COMPOSE_FILE" \
                      config -q
                '''
            }
        }

        stage('Deploy Part-II') {
            steps {
                sh '''
                    docker compose \
                      --env-file "$ENV_FILE" \
                      -f "$COMPOSE_FILE" \
                      up -d
                '''
            }
        }
    }

    post {
        always {
            script {
                emailext(
                    to: "${env.COMMIT_AUTHOR_EMAIL ?: ''}",
                    recipientProviders: [
                        [$class: 'DevelopersRecipientProvider']
                    ],
                    subject: "Inventory App Part-II: ${currentBuild.currentResult} (#${env.BUILD_NUMBER})",
                    body: """Build result: ${currentBuild.currentResult}

Job: ${env.JOB_NAME}
Build: ${env.BUILD_URL}

Please review the Jenkins console output for details."""
                )
            }
        }
    }
}

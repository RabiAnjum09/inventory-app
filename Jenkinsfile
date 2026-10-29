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
        INSTRUCTOR_EMAIL = 'qasimalik@gmail.com'
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
                    set -e

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
                    set -e

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
                def publicIp = sh(
                    script: '''
                        set -e

                        TOKEN=$(curl -fsS \
                          --connect-timeout 3 \
                          --max-time 5 \
                          -X PUT \
                          "http://169.254.169.254/latest/api/token" \
                          -H "X-aws-ec2-metadata-token-ttl-seconds: 60")

                        curl -fsS \
                          --connect-timeout 3 \
                          --max-time 5 \
                          -H "X-aws-ec2-metadata-token: $TOKEN" \
                          "http://169.254.169.254/latest/meta-data/public-ipv4"
                    ''',
                    returnStdout: true
                ).trim()

                def jenkinsUrl = "http://${publicIp}:8080"

                def recipients = [
                    env.COMMIT_AUTHOR_EMAIL,
                    env.INSTRUCTOR_EMAIL
                ].findAll { it?.trim() }
                 .unique()
                 .join(',')

                emailext(
                    to: recipients,
                    recipientProviders: [
                        [$class: 'DevelopersRecipientProvider']
                    ],
                    subject: "Inventory App Part-II: ${currentBuild.currentResult} (#${env.BUILD_NUMBER})",
                    body: """Build result: ${currentBuild.currentResult}

Job: ${env.JOB_NAME}
Build: ${jenkinsUrl}/job/${env.JOB_NAME}/${env.BUILD_NUMBER}/

Please review the Jenkins console output for details."""
                )
            }
        }
    }
}

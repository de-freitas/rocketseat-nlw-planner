import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { dayjs } from "../lib/dayjs";
import { getMailClient } from "../lib/mail";
import { capitalizeMonths } from "../utils/formatToCapitalize";
import nodemailer from "nodemailer";
import { ClientError } from "../errors/client-error";
import { env } from "../env";

export async function confirmTrip(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/trips/:tripId/confirm",
    {
      schema: {
        params: z.object({
          tripId: z.string().uuid(),
        }),
      },
    },
    async (request, reply) => {
      const { tripId } = request.params;

      const trip = await prisma.trips.findUnique({
        where: {
          id: tripId,
        },
        include: {
          participants: {
            where: {
              is_owner: false,
            },
          },
        },
      });

      if (!trip) {
        throw new ClientError(`Trip not found!`);
      }

      if (trip.is_confirmed) {
        return reply.redirect(`${env.FRONT_BASE_URL}/trips/${tripId}`);
      }

      await prisma.trips.update({
        where: {
          id: tripId,
        },
        data: { is_confirmed: true },
      });

      reply.redirect(`${env.FRONT_BASE_URL}/trips/${tripId}`);

      const formattedStartDateToBR = dayjs(trip.starts_at).format("LL");
      const formattedEndDateToBR = dayjs(trip.ends_at).format("LL");

      const formattedStartDate = capitalizeMonths(formattedStartDateToBR);
      const formattedEndDate = capitalizeMonths(formattedEndDateToBR);

      const mail = await getMailClient();

      await Promise.all([
        trip.participants.map(async (participant) => {
          const confirmationLink = `${env.API_BASE_URL}/participants/${participant.id}/confirm`;

          const message = await mail.sendMail({
            from: {
              name: "Equipe Plann.er",
              address: "oi@planner.com.br",
            },
            to: participant.email,
            subject: `Confirme sua viagem para ${trip.destination}`,
            html: `<div style="font-family: sans-serif; font-size: 16px; line-height: 1.6">
                    <p>
                      Você foi convidado(a) para participar de uma viagem para <strong>${trip.destination}</strong>, nas datas de
                      <strong>${formattedStartDate}</strong> até <strong>${formattedEndDate}</strong>.
                    </p>
                    <p></p>
                    <p>Para confirmar sua presença, clique no link abaixo:</p>
                    <p></p>
                    <p>
                      <a href=${confirmationLink}>Confirmar viagem</a>
                    </p>
    
                    <p></p>
                    <p>Caso você não saiba do que se trata esse e-mail, apenas ignore.</p>
                  </div>
                  `.trim(),
          });

          console.log(nodemailer.getTestMessageUrl(message));
        }),
      ]);
    }
  );
}
